// ci.yml's `docker` job builds the image on the runner CT's shared Docker daemon,
// boots it against the job's Postgres and probes it (#103). It names its image and
// container per run and attempt, and a step before the build removes what earlier
// attempts of the run left: a re-run keeps the run id, and an attempt the runner
// lost never ran its cleanup step. Both the naming and the removal step are ported
// from diversif's `docker-build` job and its scripts/ci-smoke-attempt.test.ts
// (diversif#697), without the volume this job does not need.
//
// The first tests read the job's names and steps from the workflow. The rest run a
// step's own `run:` text under bash, as `shell: bash` runs it, with a stub `docker`,
// `curl` and `sleep` first on PATH. The docker stub keeps its containers and images
// as files, fails the one call DOCKER_STUB_FAIL names, and answers as Docker 29.9.3
// did for diversif#697: the `name` filter is an unanchored regex, matched against a
// container's name with and without its leading slash; `rm --force` and
// `image rm --force` exit 0 on a missing name, `image rm` printing an error for it.
// A `docker exec <container> sh -c <script>` runs the step's own in-container script
// under the host's sh, with PATH set to a folder that stands for the image's (#106),
// and with `command -v` looking up only its first name, as the image's busybox 1.37
// sh does: there `command -v nope npm` prints nothing and exits 127.
import { afterAll, describe, expect, it } from "vitest";
import { spawnSync, execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";

const repo = path.resolve(__dirname, "..");
const CI = ".forgejo/workflows/ci.yml";
const JOB = "docker";
const REMOVAL = "Remove earlier attempts' container and image";
const START = "Start the built image against the job's Postgres";
const PROBE = "Probe /api/health, the migrations and the static assets";
const PACKAGE_MANAGERS = "Check the image ships no package manager";
const CLEANUP = "Container logs, then remove the smoke container and image";
const RUN_ID = "4011";
const IMAGE_ID = "0123456789ab";
const NAMES = ["SMOKE_IMAGE", "SMOKE_CONTAINER"] as const;
// forgejo-runner v13 runs a `shell: bash` step file as
// `bash --noprofile --norc -e -o pipefail <file>` (act/runner/step_run.go).
const BASH_FLAGS = ["--noprofile", "--norc", "-e", "-o", "pipefail"];
// A few bash runs per test; a loaded CI runner can stall a process for seconds.
const TIMEOUT = 30_000;

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  shell?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};
type Job = { name?: string; env: Record<string, string>; steps: Step[] };

function dockerJob(): Job {
  const workflow = parse(readFileSync(path.join(repo, CI), "utf8")) as { jobs: Record<string, Job> };
  const job = workflow.jobs[JOB];
  if (!job) throw new Error(`${CI} has no ${JOB} job`);
  return job;
}

function step(name: string): Step {
  const found = dockerJob().steps.filter((s) => s.name === name);
  if (found.length !== 1) throw new Error(`${CI} has ${found.length} ${JOB} steps named ${name}`);
  return found[0]!;
}

const label = (s: Step): string => s.name ?? s.uses ?? s.run ?? "?";

// A name of attempt `attempt`, from the job's own env value.
function nameOf(env: (typeof NAMES)[number], attempt: string): string {
  return dockerJob()
    .env[env]!.replaceAll("${{ github.run_id }}", RUN_ID)
    .replaceAll("${{ github.run_attempt }}", attempt);
}
const container = (n: number | string) => nameOf("SMOKE_CONTAINER", String(n));
const image = (n: number | string) => nameOf("SMOKE_IMAGE", String(n));

describe("the docker job", () => {
  it("names its image and container once, per run and attempt", () => {
    const job = dockerJob();
    expect(job.env.SMOKE_IMAGE).toBe("coffee-tracker:ci-smoke-${{ github.run_id }}-${{ github.run_attempt }}");
    expect(job.env.SMOKE_CONTAINER).toBe("coffee-tracker-smoke-${{ github.run_id }}-${{ github.run_attempt }}");
    const resets = job.steps.flatMap((s) =>
      Object.keys(s.env ?? {})
        .filter((name) => (NAMES as readonly string[]).includes(name))
        .map((name) => `${label(s)} sets ${name}`),
    );
    expect(resets).toEqual([]);
  });

  it("spells out no smoke name in a step instead of reading the env", () => {
    const spelled = dockerJob().steps.flatMap((s) =>
      [s.run, ...Object.values(s.with ?? {}), ...Object.values(s.env ?? {})]
        .filter((text): text is string => typeof text === "string")
        .filter((text) => /coffee-tracker[-:](ci-)?smoke/.test(text))
        .map((text) => `${label(s)}: ${text}`),
    );
    expect(spelled).toEqual([]);
  });

  it("runs the removal step under bash, before any docker build, on github.run_attempt", () => {
    const steps = dockerJob().steps;
    const removal = steps.findIndex((s) => s.name === REMOVAL);
    const build = steps.findIndex((s) => (s.run ?? "").includes("docker build"));
    expect(removal).toBeGreaterThanOrEqual(0);
    expect(build).toBeGreaterThan(removal);
    expect(steps[removal]!.shell).toBe("bash");
    expect(steps[removal]!.env).toEqual({ RUN_ATTEMPT: "${{ github.run_attempt }}" });
  });

  it("lints the Dockerfile with docker build --check before it builds the image", () => {
    const runs = dockerJob().steps.map((s) => s.run ?? "");
    const check = runs.indexOf("docker build --check .");
    const build = runs.indexOf('docker build --tag "$SMOKE_IMAGE" .');
    expect(check).toBeGreaterThanOrEqual(0);
    expect(build).toBeGreaterThan(check);
  });

  it("prints both names before the start step runs docker run", () => {
    const lines = step(START).run!.split("\n");
    const echo = lines.findIndex(
      (l) => l.startsWith("echo ") && l.includes("$SMOKE_CONTAINER") && l.includes("$SMOKE_IMAGE"),
    );
    const dockerRun = lines.findIndex((l) => l.startsWith("docker run "));
    expect(echo).toBeGreaterThanOrEqual(0);
    expect(dockerRun).toBeGreaterThan(echo);
  });

  it("probes under bash after the start step, then always removes this attempt's container and image", () => {
    const steps = dockerJob().steps;
    const start = steps.findIndex((s) => s.name === START);
    const probe = steps.findIndex((s) => s.name === PROBE);
    const cleanup = steps.findIndex((s) => s.name === CLEANUP);
    expect(probe).toBeGreaterThan(start);
    expect(cleanup).toBe(steps.length - 1);
    expect(steps[probe]!.shell).toBe("bash");
    expect(steps[cleanup]!.if).toBe("always()");
    const run = steps[cleanup]!.run!;
    expect(run).toContain('docker rm --force "$SMOKE_CONTAINER"');
    expect(run).toContain('docker image rm --force "$SMOKE_IMAGE"');
  });

  it("looks for package managers under bash after the probe, before the cleanup", () => {
    const steps = dockerJob().steps;
    const probe = steps.findIndex((s) => s.name === PROBE);
    const check = steps.findIndex((s) => s.name === PACKAGE_MANAGERS);
    expect(check).toBeGreaterThan(probe);
    expect(check).toBe(steps.length - 2);
    expect(steps[check]!.shell).toBe("bash");
  });

  // An `if` or a `continue-on-error` on the job or a step would let it pass while a
  // check is skipped or fails, so the job and its steps may use only the keys they
  // use today, and only the cleanup an `if`. A new key fails here by name.
  it("runs the job and every step but the cleanup unconditionally, with no key it does not use today", () => {
    const job = dockerJob();
    expect(Object.keys(job).filter((k) => !["name", "runs-on", "services", "env", "steps"].includes(k))).toEqual([]);
    const stepKeys = ["name", "uses", "shell", "env", "run"];
    const extra = job.steps.flatMap((s) =>
      Object.keys(s)
        .filter((k) => !stepKeys.includes(k) && !(k === "if" && s.name === CLEANUP))
        .map((k) => `${label(s)}: ${k}`),
    );
    expect(extra).toEqual([]);
  });
});

const DOCKER_STUB = String.raw`
# Answers the docker calls the removal and probe steps make, and fails on any other.
state=$STUB_STATE
# An exec's last argument is a multi-line script: log it as one line, without it.
case "$1" in
  exec) printf 'exec %s %s %s <script>\n' "$2" "$3" "$4" >>"$state/calls" ;;
  *) printf '%s\n' "$*" >>"$state/calls" ;;
esac
call=$1
case "$1" in image) call="$1 $2" ;; esac
if [ "$call" = "${"${DOCKER_STUB_FAIL:-}"}" ]; then
  echo "Error response from daemon: stub failure on $call" >&2
  exit 1
fi
case "$1 $2 $3 $4" in
  "ps --all --quiet --filter")
    regex=${"${5#name=}"}
    for f in "$state"/containers/*; do
      [ -e "$f" ] || continue
      name=${"${f##*/}"}
      if printf '%s\n' "/$name" "$name" | grep -Eq -- "$regex"; then echo "id-$name"; fi
    done
    ;;
  "rm --force "*)
    rm -f -- "$state/containers/$3"
    ;;
  "images --quiet "*)
    if [ -e "$state/images/$3" ]; then echo "$DOCKER_STUB_IMAGE_ID"; fi
    ;;
  "image rm --force "*)
    if [ -e "$state/images/$4" ]; then
      rm -f -- "$state/images/$4"
      echo "Untagged: $4"
    else
      echo "Error response from daemon: No such image: $4" >&2
    fi
    ;;
  "inspect --format {{.State.Running}} "*)
    # One line per inspect call; the last line repeats.
    f="$state/containers/$4"
    if [ ! -e "$f" ]; then
      echo "Error: No such object: $4" >&2
      exit 1
    fi
    head -n 1 "$f"
    if [ "$(wc -l <"$f")" -gt 1 ]; then
      tail -n +2 "$f" >"$f.next"
      mv "$f.next" "$f"
    fi
    ;;
  "exec "*" node -e")
    # The migration check: answers $state/exec-out and exits $state/exec-status.
    if [ $# -ne 5 ]; then echo "docker stub: unexpected call: $*" >&2; exit 2; fi
    cat "$state/exec-out"
    exit "$(cat "$state/exec-status")"
    ;;
  "exec "*" sh -c")
    # The package manager check: runs its script with $state/image-bin as PATH,
    # under a command -v that, like busybox 1.37's, looks up only its first name.
    if [ $# -ne 5 ]; then echo "docker stub: unexpected call: $*" >&2; exit 2; fi
    lookup='command() {
      if [ "$1" != -v ]; then echo "sh stub: unexpected command $*" >&2; return 2; fi
      if [ -x "$PATH/$2" ]; then echo "$PATH/$2"; else return 127; fi
    }'
    PATH="$state/image-bin" exec "$STUB_SH" -c "$lookup
$5"
    ;;
  *)
    echo "docker stub: unexpected call: $*" >&2
    exit 2
    ;;
esac
`;

// Serves http://127.0.0.1:3000 from $STUB_STATE/http/<path with / as _>/{status,type,body}.
// A missing path answers 404. Like curl --fail, it exits 22 on a status of 400 or
// more and 0 on a 3xx. $STUB_STATE/health-down holds how many more /api/health
// calls fail to connect (curl exit 7) before the server answers. Each call is
// logged with its --max-time, empty when the step passed none.
const CURL_STUB = String.raw`
state=$STUB_STATE
output= writeout= url= maxtime=
while [ $# -gt 0 ]; do
  case "$1" in
    --output) output=$2; shift 2 ;;
    --write-out) writeout=$2; shift 2 ;;
    --max-time) maxtime=$2; shift 2 ;;
    --fail | --silent) shift ;;
    http://*) url=$1; shift ;;
    *) echo "curl stub: unexpected argument: $1" >&2; exit 2 ;;
  esac
done
p=${"${url#http://127.0.0.1:3000}"}
printf 'curl %s max-time=%s\n' "$p" "$maxtime" >>"$state/calls"
if [ "$p" = /api/health ] && [ -s "$state/health-down" ]; then
  left=$(cat "$state/health-down")
  if [ "$left" -gt 0 ]; then
    echo $((left - 1)) >"$state/health-down"
    exit 7
  fi
fi
dir="$state/http/$(printf %s "$p" | tr / _)"
if [ ! -d "$dir" ]; then exit 22; fi
if [ "$(cat "$dir/status")" -ge 400 ]; then exit 22; fi
if [ -z "$output" ]; then cat "$dir/body"; fi
case "$writeout" in
  '') ;;
  '%{http_code} %{content_type}') printf '%s %s' "$(cat "$dir/status")" "$(cat "$dir/type")" ;;
  *) echo "curl stub: unexpected --write-out: $writeout" >&2; exit 2 ;;
esac
exit 0
`;

const SLEEP_STUB = String.raw`printf 'sleep %s\n' "$*" >>"$STUB_STATE/calls"`;

// Logs its limit, then runs the command with no limit. Exits 124, as coreutils
// timeout does at its limit, when $STUB_STATE/timeout-expires exists.
const TIMEOUT_STUB = String.raw`
printf 'timeout %s\n' "$1" >>"$STUB_STATE/calls"
if [ -e "$STUB_STATE/timeout-expires" ]; then exit 124; fi
shift
exec "$@"
`;

const bash = execFileSync("sh", ["-c", "command -v bash"], { encoding: "utf8" }).trim();
if (!bash) throw new Error("bash is not on PATH");
// Absolute, as the docker stub runs it with PATH set to the image's folder.
const sh = execFileSync("sh", ["-c", "command -v sh"], { encoding: "utf8" }).trim();
if (!sh.startsWith("/")) throw new Error(`sh resolves to '${sh}', not an absolute path`);
const base = mkdtempSync(path.join(tmpdir(), "ci-docker-smoke-"));
let stubCount = 0;
afterAll(() => rmSync(base, { recursive: true, force: true }));

type Stub = { dir: string; state: string; bin: string };
type Http = Record<string, { status?: number; type?: string; body?: string }>;

const SCRIPT = "/_next/static/chunks/0abc.js";
// What the booted image answers on main once the fix is in.
const HEALTHY: Http = {
  "/api/health": { type: "application/json", body: '{"ok":true}' },
  "/icons/icon-192.png": { type: "image/png", body: "PNG" },
  "/login": { type: "text/html", body: `<html><script src="${SCRIPT}" async=""></script></html>` },
  [SCRIPT]: { type: "application/javascript; charset=UTF-8", body: "js" },
};

// A fresh stub. `containers` maps each container's name to the lines its
// `docker inspect` answers in turn. `migrations` is what the migration check's
// `docker exec` prints (the applied rows, then the journal's entries) and its exit.
// `imageCommands` are the executables on the image's PATH.
function stub(
  opts: {
    containers?: Record<string, string>;
    images?: string[];
    http?: Http;
    healthDown?: number;
    migrations?: { out: string; status?: number };
    imageCommands?: string[];
  } = {},
): Stub {
  stubCount += 1;
  const dir = path.join(base, String(stubCount));
  const s = { dir, state: path.join(dir, "state"), bin: path.join(dir, "bin") };
  for (const sub of ["containers", "images", "http", "image-bin"]) mkdirSync(path.join(s.state, sub), { recursive: true });
  for (const cmd of opts.imageCommands ?? []) {
    writeFileSync(path.join(s.state, "image-bin", cmd), "#!/bin/sh\n");
    chmodSync(path.join(s.state, "image-bin", cmd), 0o755);
  }
  mkdirSync(s.bin);
  writeFileSync(path.join(s.state, "calls"), "");
  for (const [name, lines] of Object.entries(opts.containers ?? {})) {
    writeFileSync(path.join(s.state, "containers", name), lines);
  }
  for (const name of opts.images ?? []) writeFileSync(path.join(s.state, "images", name), "");
  for (const [p, r] of Object.entries(opts.http ?? {})) {
    const d = path.join(s.state, "http", p.replaceAll("/", "_"));
    mkdirSync(d);
    writeFileSync(path.join(d, "status"), String(r.status ?? 200));
    writeFileSync(path.join(d, "type"), r.type ?? "");
    writeFileSync(path.join(d, "body"), r.body ?? "");
  }
  if (opts.healthDown !== undefined) writeFileSync(path.join(s.state, "health-down"), String(opts.healthDown));
  const migrations = opts.migrations ?? { out: "10 10\n" };
  writeFileSync(path.join(s.state, "exec-out"), migrations.out);
  writeFileSync(path.join(s.state, "exec-status"), String(migrations.status ?? 0));
  for (const [cmd, text] of [
    ["docker", DOCKER_STUB],
    ["curl", CURL_STUB],
    ["sleep", SLEEP_STUB],
    ["timeout", TIMEOUT_STUB],
  ]) {
    writeFileSync(path.join(s.bin, cmd!), `#!${bash}\n${text}`);
    chmodSync(path.join(s.bin, cmd!), 0o755);
  }
  return s;
}

function runStep(s: Stub, name: string, env: Record<string, string>) {
  const script = path.join(s.dir, "step.sh");
  writeFileSync(script, step(name).run!);
  // Only these variables, as the step sees only the job's env. The cast drops the
  // repo's NODE_ENV requirement on ProcessEnv, which a step's env does not carry.
  const stepEnv = {
    PATH: `${s.bin}:${process.env.PATH ?? ""}`,
    STUB_STATE: s.state,
    STUB_SH: sh,
    DOCKER_STUB_IMAGE_ID: IMAGE_ID,
    ...env,
  } as unknown as NodeJS.ProcessEnv;
  const r = spawnSync(bash, [...BASH_FLAGS, script], { env: stepEnv, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function runRemoval(
  s: Stub,
  attempt: string,
  opts: { fail?: string; names?: Partial<Record<(typeof NAMES)[number], string>> } = {},
) {
  return runStep(s, REMOVAL, {
    RUN_ATTEMPT: attempt,
    SMOKE_CONTAINER: container(attempt),
    SMOKE_IMAGE: image(attempt),
    ...opts.names,
    ...(opts.fail ? { DOCKER_STUB_FAIL: opts.fail } : {}),
  });
}

const runProbe = (s: Stub) => runStep(s, PROBE, { SMOKE_CONTAINER: container(1) });
const runPackageManagerCheck = (s: Stub, env: Record<string, string> = {}) =>
  runStep(s, PACKAGE_MANAGERS, { SMOKE_CONTAINER: container(1), ...env });

const calls = (s: Stub) => readFileSync(path.join(s.state, "calls"), "utf8").split("\n").filter(Boolean);
const removals = (s: Stub) => calls(s).filter((c) => /^(image )?rm /.test(c));
const left = (s: Stub, kind: "containers" | "images") => readdirSync(path.join(s.state, kind)).sort();
const count = (s: Stub, call: string) => calls(s).filter((c) => c === call).length;
const curls = (s: Stub) => calls(s).filter((c) => c.startsWith("curl "));
const HEALTH = "curl /api/health max-time=5";

// Names that contain attempt 1's name without being it.
const decoys = (name: string) => [`${name}0`, `${name}x`, `pre-${name}`];

describe("the removal step", () => {
  it(
    "on attempt 1 prints one line, calls no docker and keeps its own names",
    () => {
      const s = stub({ containers: { [container(1)]: "" }, images: [image(1)] });
      expect(runRemoval(s, "1")).toEqual({
        code: 0,
        out: "This is attempt 1: no earlier attempt to clean up\n",
        err: "",
      });
      expect(calls(s)).toEqual([]);
      expect(left(s, "containers")).toEqual([container(1)]);
      expect(left(s, "images")).toEqual([image(1)]);
    },
    TIMEOUT,
  );

  it(
    "on attempt 3 removes what attempts 1 and 2 left, each container before its image",
    () => {
      const s = stub({
        containers: { [container(1)]: "", [container(2)]: "", [container(3)]: "" },
        images: [image(1), image(2), image(3)],
      });
      expect(runRemoval(s, "3")).toEqual({
        code: 0,
        out:
          `Attempt 1: container ${container(1)} removed, image ${image(1)} removed\n` +
          `Attempt 2: container ${container(2)} removed, image ${image(2)} removed\n`,
        err: "",
      });
      expect(removals(s)).toEqual([
        `rm --force ${container(1)}`,
        `image rm --force ${image(1)}`,
        `rm --force ${container(2)}`,
        `image rm --force ${image(2)}`,
      ]);
      expect(left(s, "containers")).toEqual([container(3)]);
      expect(left(s, "images")).toEqual([image(3)]);
    },
    TIMEOUT,
  );

  it(
    "skips each name that is absent and removes the ones left",
    () => {
      const s = stub({ containers: { [container(1)]: "" }, images: [image(2)] });
      expect(runRemoval(s, "3")).toEqual({
        code: 0,
        out:
          `Attempt 1: container ${container(1)} removed, image ${image(1)} absent\n` +
          `Attempt 2: container ${container(2)} absent, image ${image(2)} removed\n`,
        err: "",
      });
      expect(removals(s)).toEqual([`rm --force ${container(1)}`, `image rm --force ${image(2)}`]);
      expect(left(s, "containers")).toEqual([]);
      expect(left(s, "images")).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    "checks each name exactly, so a name that only contains it stays",
    () => {
      const s = stub({
        containers: Object.fromEntries(decoys(container(1)).map((c) => [c, ""])),
        images: decoys(image(1)),
      });
      expect(runRemoval(s, "2")).toEqual({
        code: 0,
        out: `Attempt 1: container ${container(1)} absent, image ${image(1)} absent\n`,
        err: "",
      });
      expect(calls(s)).toEqual([`ps --all --quiet --filter name=^/${container(1)}$`, `images --quiet ${image(1)}`]);
      expect(left(s, "containers")).toEqual(decoys(container(1)).sort());
      expect(left(s, "images")).toEqual(decoys(image(1)).sort());
    },
    TIMEOUT,
  );

  // Attempt 1 left both, so the step reaches all four calls.
  it.each(["ps", "rm", "images", "image rm"])(
    "fails at a failed docker %s with an ::error:: line, before it reports the attempt",
    (call) => {
      const s = stub({ containers: { [container(1)]: "" }, images: [image(1)] });
      const r = runRemoval(s, "2", { fail: call });
      expect(r.code).toBe(1);
      expect(r.out).toBe("::error::a docker call failed while removing what attempt 1 of this run left\n");
      expect(r.err).toBe(`Error response from daemon: stub failure on ${call}\n`);
      expect(calls(s).at(-1)!.startsWith(`${call} `)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "names the attempt it was removing when a docker call fails",
    () => {
      const s = stub({ containers: { [container(2)]: "" }, images: [image(2)] });
      const r = runRemoval(s, "3", { fail: "image rm" });
      expect(r.code).toBe(1);
      expect(r.out).toBe(
        `Attempt 1: container ${container(1)} absent, image ${image(1)} absent\n` +
          "::error::a docker call failed while removing what attempt 2 of this run left\n",
      );
      expect(r.err).toBe("Error response from daemon: stub failure on image rm\n");
    },
    TIMEOUT,
  );

  // A forge that stopped sending run_attempt would give every attempt one name.
  it.each(["", "0", "01", "a", "2x", "-1", " 2"])(
    "fails before any docker call on run_attempt %j",
    (attempt) => {
      const s = stub();
      const r = runRemoval(s, attempt);
      expect(r.code).toBe(1);
      expect(r.out).toBe(
        `::error::github.run_attempt is '${attempt}', not a positive integer, so the smoke container and image names do not tell this run's attempts apart\n`,
      );
      expect(calls(s)).toEqual([]);
    },
    TIMEOUT,
  );

  it.each(NAMES)(
    "fails before any docker call when %s lacks the attempt suffix",
    (name) => {
      const s = stub();
      const r = runRemoval(s, "2", { names: { [name]: nameOf(name, "2").replace(/-2$/, "") } });
      expect(r.code).toBe(1);
      expect(r.out).toContain("::error::");
      expect(r.out).toContain("must both end in -2");
      expect(calls(s)).toEqual([]);
    },
    TIMEOUT,
  );
});

describe("the probe step", () => {
  const running = () => ({ [container(1)]: "true\n" });

  it(
    "passes on a booted image, printing what each probe answered, each request under its --max-time",
    () => {
      const s = stub({ containers: running(), http: HEALTHY });
      expect(runProbe(s)).toEqual({
        code: 0,
        out:
          '/api/health answered {"ok":true} after 1 tries\n' +
          "10 of 10 migrations applied\n" +
          "/icons/icon-192.png answered 200 image/png\n" +
          `${SCRIPT} answered 200 application/javascript; charset=UTF-8\n`,
        err: "",
      });
      expect(curls(s)).toEqual([
        HEALTH,
        "curl /icons/icon-192.png max-time=10",
        "curl /login max-time=10",
        `curl ${SCRIPT} max-time=10`,
      ]);
      expect(calls(s).filter((c) => /^(timeout|exec) /.test(c))).toEqual([
        "timeout 30",
        `exec ${container(1)} node -e <script>`,
      ]);
    },
    TIMEOUT,
  );

  it(
    "fails when the migration check reaches its 30 s limit",
    () => {
      const s = stub({ containers: running(), http: HEALTHY });
      writeFileSync(path.join(s.state, "timeout-expires"), "");
      const r = runProbe(s);
      expect(r.code).toBe(1);
      expect(r.out.split("\n").filter(Boolean).at(-1)).toBe(
        "::error::could not read drizzle.__drizzle_migrations in the container",
      );
      expect(calls(s).filter((c) => c.startsWith("exec "))).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    "fails when the migration check cannot read the migrations table",
    () => {
      const s = stub({ containers: running(), http: HEALTHY, migrations: { out: "", status: 1 } });
      expect(runProbe(s)).toEqual({
        code: 1,
        out:
          '/api/health answered {"ok":true} after 1 tries\n' +
          "::error::could not read drizzle.__drizzle_migrations in the container\n",
        err: "",
      });
      expect(curls(s)).toEqual([HEALTH]);
    },
    TIMEOUT,
  );

  it(
    "fails when fewer migrations were applied than the journal lists",
    () => {
      const s = stub({ containers: running(), http: HEALTHY, migrations: { out: "9 10\n" } });
      const r = runProbe(s);
      expect(r.code).toBe(1);
      expect(r.out.split("\n").filter(Boolean).at(-1)).toBe("::error::9 migrations applied, but the journal lists 10");
      expect(curls(s)).toEqual([HEALTH]);
    },
    TIMEOUT,
  );

  it.each(["", "10", "10 10 10", "0 0", "0 10", "10 0", "01 01", "a b", "10  10", " 10 10"])(
    "fails when the migration check prints %j",
    (out) => {
      const s = stub({ containers: running(), http: HEALTHY, migrations: { out: `${out}\n` } });
      const r = runProbe(s);
      expect(r.code).toBe(1);
      expect(r.out.split("\n").filter(Boolean).at(-1)).toBe(
        `::error::the migration check printed '${out}', not two positive counts`,
      );
      expect(curls(s)).toEqual([HEALTH]);
    },
    TIMEOUT,
  );

  it(
    "accepts a script served as application/javascript with no parameters",
    () => {
      const s = stub({ containers: running(), http: { ...HEALTHY, [SCRIPT]: { type: "application/javascript" } } });
      const r = runProbe(s);
      expect(r.code).toBe(0);
      expect(r.out).toContain(`${SCRIPT} answered 200 application/javascript\n`);
    },
    TIMEOUT,
  );

  it(
    "waits for the server: it passes when /api/health first answers on try 60",
    () => {
      const s = stub({ containers: running(), http: HEALTHY, healthDown: 59 });
      const r = runProbe(s);
      expect(r.code).toBe(0);
      expect(r.out).toContain('/api/health answered {"ok":true} after 60 tries\n');
      expect(count(s, HEALTH)).toBe(60);
      expect(count(s, "sleep 1")).toBe(59);
    },
    TIMEOUT,
  );

  it(
    "fails after 60 tries when /api/health never answers",
    () => {
      const s = stub({ containers: running(), http: HEALTHY, healthDown: 60 });
      expect(runProbe(s)).toEqual({
        code: 1,
        out: "::error::/api/health did not answer within 60 tries\n",
        err: "",
      });
      expect(count(s, HEALTH)).toBe(60);
      expect(count(s, "sleep 1")).toBe(60);
    },
    TIMEOUT,
  );

  it(
    "fails at once when the container stops before /api/health answers",
    () => {
      const s = stub({ containers: { [container(1)]: "true\ntrue\nfalse\n" }, http: HEALTHY, healthDown: 10 });
      expect(runProbe(s)).toEqual({
        code: 1,
        out: `::error::container ${container(1)} stopped before /api/health answered\n`,
        err: "",
      });
      expect(count(s, HEALTH)).toBe(2);
    },
    TIMEOUT,
  );

  it(
    "fails when docker inspect cannot find the container",
    () => {
      const s = stub({ http: HEALTHY });
      const r = runProbe(s);
      expect(r.code).toBe(1);
      expect(r.err).toBe(`Error: No such object: ${container(1)}\n`);
      expect(curls(s)).toEqual([]);
    },
    TIMEOUT,
  );

  it.each(['{"ok":false}', '{"ok":true} ', "ok"])(
    "fails when /api/health answers %j",
    (body) => {
      const s = stub({ containers: running(), http: { ...HEALTHY, "/api/health": { body } } });
      expect(runProbe(s)).toEqual({
        code: 1,
        out: `::error::/api/health answered '${body}', not {"ok":true}\n`,
        err: "",
      });
    },
    TIMEOUT,
  );

  it.each([
    ["the icon answers 404", { "/icons/icon-192.png": { status: 404 } }, "::error::/icons/icon-192.png did not answer 2xx"],
    [
      "the icon is not a PNG",
      { "/icons/icon-192.png": { type: "text/html" } },
      "::error::/icons/icon-192.png answered '200 text/html', not 200 image/png",
    ],
    // curl --fail exits 0 on a 3xx, so only the status check catches a redirect.
    [
      "the icon redirects",
      { "/icons/icon-192.png": { status: 302, type: "image/png" } },
      "::error::/icons/icon-192.png answered '302 image/png', not 200 image/png",
    ],
    ["/login answers 500", { "/login": { status: 500 } }, "::error::/login did not answer 2xx"],
    [
      "/login links no static script",
      { "/login": { body: "<html><script src=/other.js></script></html>" } },
      "::error::/login links no script under /_next/static",
    ],
    ["the linked script answers 404", { [SCRIPT]: { status: 404 } }, `::error::${SCRIPT} did not answer 2xx`],
    [
      "the linked script redirects",
      { [SCRIPT]: { status: 302, type: "application/javascript" } },
      `::error::${SCRIPT} answered '302 application/javascript', not 200 application/javascript`,
    ],
    [
      "the linked script is served as HTML",
      { [SCRIPT]: { type: "text/html; charset=utf-8" } },
      `::error::${SCRIPT} answered '200 text/html; charset=utf-8', not 200 application/javascript`,
    ],
    [
      "the linked script's type only starts with application/javascript",
      { [SCRIPT]: { type: "application/javascriptx" } },
      `::error::${SCRIPT} answered '200 application/javascriptx', not 200 application/javascript`,
    ],
  ] as const)(
    "fails when %s",
    (_case, override, error) => {
      const s = stub({ containers: running(), http: { ...HEALTHY, ...override } });
      const r = runProbe(s);
      expect(r.code).toBe(1);
      expect(r.out.split("\n").filter(Boolean).at(-1)).toBe(error);
      expect(r.err).toBe("");
    },
    TIMEOUT,
  );
});

describe("the package manager check", () => {
  const PACKAGE_MANAGER_NAMES = ["npm", "npx", "corepack", "yarn", "yarnpkg"];
  const execs = (s: Stub) => calls(s).filter((c) => c.startsWith("exec "));

  it(
    "passes on an image that ships only node, printing one line",
    () => {
      const s = stub({ imageCommands: ["node", "nodejs", "docker-entrypoint.sh"] });
      expect(runPackageManagerCheck(s)).toEqual({
        code: 0,
        out: "The image ships none of npm, npx, corepack, yarn and yarnpkg\n",
        err: "",
      });
      expect(execs(s)).toEqual([`exec ${container(1)} sh -c <script>`]);
    },
    TIMEOUT,
  );

  it.each(PACKAGE_MANAGER_NAMES)(
    "fails when the image ships %s",
    (name) => {
      const s = stub({ imageCommands: ["node", name] });
      expect(runPackageManagerCheck(s)).toEqual({
        code: 1,
        out: `::error::the image ships these package managers: ${s.state}/image-bin/${name}\n`,
        err: "",
      });
    },
    TIMEOUT,
  );

  it(
    "names every package manager the image ships, on one line",
    () => {
      const s = stub({ imageCommands: ["node", ...PACKAGE_MANAGER_NAMES] });
      const r = runPackageManagerCheck(s);
      expect(r.code).toBe(1);
      expect(r.out).toBe(
        `::error::the image ships these package managers: ${PACKAGE_MANAGER_NAMES.map((n) => `${s.state}/image-bin/${n}`).join(" ")}\n`,
      );
    },
    TIMEOUT,
  );

  it(
    "fails when docker exec fails",
    () => {
      const s = stub({ imageCommands: ["node"] });
      expect(runPackageManagerCheck(s, { DOCKER_STUB_FAIL: "exec" })).toEqual({
        code: 1,
        out: `::error::could not look for package managers in container ${container(1)}\n`,
        err: "Error response from daemon: stub failure on exec\n",
      });
    },
    TIMEOUT,
  );
});
