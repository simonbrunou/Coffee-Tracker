"use client";
/* ============ Cortado — Add a Bag (rich catalog form) ============ */
import { useState } from "react";
import { Icon, PillButton } from "./ui";
import { BeanBag } from "./cards";
import { FlavorWheelPicker } from "./flavor-wheel";
import { SheetHeader, DonePanel, SheetLabel as Label } from "./sheet-chrome";
import { ROAST_LEVELS } from "@/lib/constants";
import type { AddBagInput, Bean, UpdateBagInput } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label as UiLabel } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

function RequiredMark() {
  return (
    <span style={{ color: "var(--berry)", fontWeight: 700 }}>
      {" "}
      *<span className="sr-only"> (required)</span>
    </span>
  );
}

const BAG_COLORS = [
  "#b07a3c",
  "#c98a4a",
  "#a8434a",
  "#8a5a36",
  "#9a5f2e",
  "#4f3a2c",
  "#c07ba0",
  "#5a7a5a",
  "#5b6aa8",
];

export function BagForm({
  onClose,
  backToBrew,
  onBack,
  onAddBag,
  editBag,
  onUpdateBag,
}: {
  onClose: () => void;
  backToBrew?: boolean;
  onBack?: () => void;
  onAddBag: (input: AddBagInput, backToBrew: boolean) => Promise<void>;
  editBag?: Bean | null;
  onUpdateBag?: (input: UpdateBagInput) => Promise<void>;
}) {
  const isEdit = !!editBag;
  const [f, setF] = useState({
    roaster: editBag?.roasterName ?? "",
    name: editBag?.name ?? "",
    origin: editBag?.origin ?? "",
    region: editBag?.region ?? "",
    altitude: editBag?.altitude ?? "",
    farm: editBag?.farm ?? "",
    process: editBag?.process ?? "Washed",
    roast: editBag?.roast ?? "Light",
    sca: editBag?.scaScore ?? 86,
    color: editBag?.color ?? BAG_COLORS[1],
  });
  const [varieties, setVarieties] = useState<string[]>(
    editBag?.varieties ?? [],
  );
  const [varInput, setVarInput] = useState("");
  const [notes, setNotes] = useState<string[]>(editBag?.flavors ?? []);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string | number) =>
    setF((p) => ({ ...p, [k]: v }));

  const addVariety = () => {
    const v = varInput.trim();
    if (v && !varieties.includes(v)) setVarieties((a) => [...a, v]);
    setVarInput("");
  };
  const valid = f.roaster.trim() && f.name.trim() && f.origin.trim();

  const save = async () => {
    if (!valid || pending) return;
    setPending(true);
    setError(null);
    const input: AddBagInput = {
      name: f.name.trim(),
      roasterName: f.roaster.trim(),
      origin: f.origin.trim(),
      region: f.region.trim(),
      altitude: f.altitude.trim(),
      farm: f.farm.trim(),
      varieties,
      process: f.process,
      roast: f.roast,
      scaScore: Number(f.sca),
      flavors: notes,
      color: f.color,
    };
    // Await the write before showing success; on the "& continue" path the
    // provider switches the sheet to the brew view (this form unmounts).
    try {
      if (isEdit && onUpdateBag) {
        await onUpdateBag({ id: editBag!.id, ...input });
        setDone(true);
      } else {
        await onAddBag(input, !!backToBrew);
        if (!backToBrew) setDone(true);
      }
    } catch (e) {
      setPending(false);
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't save that bag — please try again.",
      );
    }
  };

  if (done)
    return (
      <DonePanel
        title={isEdit ? "Bag updated" : "Bag added to your shelf"}
        sub={`${f.name} is ready to brew.`}
      />
    );

  const scoreColor =
    f.sca >= 90
      ? "var(--sage)"
      : f.sca >= 87
        ? "var(--caramel)"
        : "var(--mocha)";

  return (
    <>
      <SheetHeader
        kicker={isEdit ? "Edit bag" : "Add a bag"}
        onClose={onClose}
        onBack={backToBrew ? onBack : undefined}
      />
      <div style={{ overflowY: "auto", padding: 20, flex: 1 }}>
        {/* preview chip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 13,
            padding: 13,
            borderRadius: "var(--r-md)",
            background: `linear-gradient(180deg, color-mix(in oklch, ${f.color} 14%, var(--surface)), var(--surface))`,
            border: "1px solid var(--line-soft)",
            marginBottom: 20,
          }}
        >
          <BeanBag color={f.color} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="display"
              style={{
                fontWeight: 600,
                fontSize: "var(--text-lg)",
                lineHeight: 1.1,
              }}
            >
              {f.name || "New coffee"}
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--mocha)" }}>
              {f.roaster || "Roaster"}
              {f.origin ? " · " + f.origin : ""}
            </div>
          </div>
          <div
            role="group"
            aria-label="Bag colour"
            style={{ display: "flex", gap: 5 }}
          >
            {BAG_COLORS.slice(0, 5).map((c) => (
              <button
                key={c}
                onClick={() => set("color", c)}
                aria-pressed={f.color === c}
                aria-label={`Colour ${c}`}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: c,
                  border:
                    f.color === c
                      ? "2px solid var(--espresso)"
                      : "2px solid transparent",
                }}
              />
            ))}
          </div>
        </div>

        <TwoCol>
          <Field
            label="Roaster"
            value={f.roaster}
            onChange={(v) => set("roaster", v)}
            placeholder="Ember & Oak"
            required
          />
          <Field
            label="Coffee name"
            value={f.name}
            onChange={(v) => set("name", v)}
            placeholder="Idido"
            required
          />
        </TwoCol>
        <TwoCol>
          <Field
            label="Origin"
            value={f.origin}
            onChange={(v) => set("origin", v)}
            placeholder="Gedeb, Ethiopia"
            required
          />
          <Field
            label="Region"
            value={f.region}
            onChange={(v) => set("region", v)}
            placeholder="Yirgacheffe"
          />
        </TwoCol>
        <TwoCol>
          <Field
            label="Altitude"
            value={f.altitude}
            onChange={(v) => set("altitude", v)}
            placeholder="1800–2200 masl"
          />
          <Field
            label="Farm / producer"
            value={f.farm}
            onChange={(v) => set("farm", v)}
            placeholder="Idido Station"
          />
        </TwoCol>

        {/* Varieties */}
        <Label>
          Variety{" "}
          <span style={{ color: "var(--mocha)", fontWeight: 400 }}>
            · add one or more
          </span>
        </Label>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: varieties.length ? 10 : 18,
          }}
        >
          <Input
            value={varInput}
            onChange={(e) => setVarInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addVariety();
              }
            }}
            placeholder="e.g. SL28, Heirloom, Pink Bourbon…"
            aria-label="Add a variety"
            className="h-auto flex-1 rounded-[10px] border-[var(--line)] bg-[var(--surface)] px-[13px] py-[11px] text-[16px] text-[var(--espresso)] md:text-[14.5px]"
          />
          <Button
            variant="outline"
            onClick={addVariety}
            disabled={!varInput.trim()}
            aria-label="Add variety"
          >
            <Icon name="plus" size={15} color="currentColor" /> Add
          </Button>
        </div>
        {varieties.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 7,
              flexWrap: "wrap",
              marginBottom: 18,
            }}
          >
            {varieties.map((v) => (
              <span
                key={v}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 8px 5px 12px",
                  borderRadius: 99,
                  background: "var(--surface-2)",
                  border: "1px solid var(--line-soft)",
                  fontSize: "var(--text-xs)",
                  fontWeight: 600,
                  color: "var(--coffee)",
                }}
              >
                {v}
                <button
                  onClick={() => setVarieties((a) => a.filter((x) => x !== v))}
                  aria-label={`Remove ${v}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 24,
                    height: 24,
                    margin: "-4px -6px -4px -2px",
                    color: "var(--mocha)",
                  }}
                >
                  <Icon name="close" size={13} color="var(--mocha)" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Process (free-form) + roast */}
        <Field
          label="Process"
          value={f.process}
          onChange={(v) => set("process", v)}
          placeholder="Washed, Natural, Anaerobic honey, Carbonic maceration…"
        />
        <Label>Roast level</Label>
        <ChipRow
          options={ROAST_LEVELS}
          value={f.roast}
          onChange={(v) => set("roast", v)}
        />

        {/* SCA score slider */}
        <div style={{ height: 22 }} />
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
          }}
        >
          <div id="sca-score-label">
            <Label>SCA cupping score</Label>
          </div>
          <span
            aria-hidden="true"
            className="display"
            style={{
              fontSize: "var(--text-3xl)",
              fontWeight: 700,
              color: scoreColor,
            }}
          >
            {Number(f.sca).toFixed(1)}
          </span>
        </div>
        <Slider
          value={[Number(f.sca)]}
          min={80}
          max={92}
          step={0.5}
          onValueChange={([v]) => set("sca", String(v))}
          aria-labelledby="sca-score-label"
          aria-valuetext={`${Number(f.sca).toFixed(1)} out of 92`}
          className="mt-2.5 [&_[data-slot=slider-range]]:bg-transparent [&_[data-slot=slider-thumb]]:size-6 [&_[data-slot=slider-thumb]]:border-[3px] [&_[data-slot=slider-thumb]]:border-[var(--espresso)] [&_[data-slot=slider-thumb]]:bg-[var(--surface)] [&_[data-slot=slider-thumb]]:shadow-[var(--shadow-md)] [&_[data-slot=slider-track]]:bg-[linear-gradient(90deg,var(--mocha),var(--caramel),var(--sage))]"
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "var(--text-2xs)",
            color: "var(--mocha)",
            marginTop: 4,
          }}
          className="mono"
        >
          <span>80 · GOOD</span>
          <span>85 · VERY GOOD</span>
          <span>90+ · OUTSTANDING</span>
        </div>

        {/* SCA tasting notes — full flavor wheel */}
        <div style={{ height: 22 }} />
        <Label>
          SCA tasting notes{" "}
          <span style={{ color: "var(--mocha)", fontWeight: 400 }}>
            · the roaster&rsquo;s notes, by the wheel
          </span>
        </Label>
        <FlavorWheelPicker value={notes} onChange={setNotes} max={10} />
      </div>
      <div
        style={{
          padding: "14px 20px calc(14px + env(safe-area-inset-bottom))",
          borderTop: "1px solid var(--line-soft)",
        }}
      >
        {error && (
          <div
            role="alert"
            style={{
              marginBottom: 10,
              fontSize: "var(--text-sm)",
              color: "var(--berry)",
            }}
          >
            {error}
          </div>
        )}
        <Button onClick={save} disabled={!valid || pending} className="w-full">
          <Icon name="check" size={18} color="currentColor" />{" "}
          {pending
            ? "Saving…"
            : isEdit
              ? "Save changes"
              : backToBrew
                ? "Save bag & continue"
                : "Add to my shelf"}
        </Button>
      </div>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label style={{ display: "block", marginBottom: 18, flex: 1 }}>
      <UiLabel
        style={{
          fontSize: "var(--text-sm)",
          fontWeight: 600,
          color: "var(--espresso)",
          marginBottom: 10,
        }}
      >
        {label}
        {required && <RequiredMark />}
      </UiLabel>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-required={required || undefined}
        required={required || undefined}
        className="h-auto rounded-[10px] border-[var(--line)] bg-[var(--surface)] px-[13px] py-[11px] text-[16px] text-[var(--espresso)] md:text-[14.5px]"
      />
    </label>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12 }} className="two-col">
      {children}
    </div>
  );
}

function ChipRow({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((o) => (
        <PillButton
          key={o}
          active={value === o}
          onClick={() => onChange(o)}
          padding="8px 14px"
          minHeight={44}
          fontSize="var(--text-xs)"
        >
          {o}
        </PillButton>
      ))}
    </div>
  );
}
