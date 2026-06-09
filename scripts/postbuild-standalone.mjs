// Assemble the Next.js standalone bundle for deployment.
//
// `next build` with output:"standalone" emits a minimal server at .next/standalone,
// but deliberately omits: .next/static and public/ (must sit beside server.js), plus
// anything not reachable from the server's import graph. This app queries via raw `pg`,
// so the `drizzle/` SQL, scripts/migrate.mts, and the `drizzle-orm` package (used only
// by the migrate runner) are NOT traced — copy them in here.
//
// Runs automatically after `next build` via the npm `postbuild` lifecycle hook, i.e.
// inside Railpack's provider build step, so every file it references is present.
import { cpSync, mkdirSync, existsSync } from "node:fs";

const SA = ".next/standalone";
if (!existsSync(`${SA}/server.js`)) {
  console.error(`postbuild: ${SA}/server.js not found — is output:"standalone" set in next.config?`);
  process.exit(1);
}

// cpSync(recursive) overwrites, so this is idempotent across local rebuilds.
const copy = (src, dst) => {
  if (existsSync(src)) cpSync(src, dst, { recursive: true });
  else console.warn(`postbuild: skipped missing ${src}`);
};

copy(".next/static", `${SA}/.next/static`);
copy("public", `${SA}/public`);
copy("drizzle", `${SA}/drizzle`);
mkdirSync(`${SA}/scripts`, { recursive: true });
copy("scripts/migrate.mts", `${SA}/scripts/migrate.mts`);
mkdirSync(`${SA}/node_modules`, { recursive: true });
copy("node_modules/drizzle-orm", `${SA}/node_modules/drizzle-orm`);

console.log("postbuild: standalone bundle assembled");
