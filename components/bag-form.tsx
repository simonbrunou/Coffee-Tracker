"use client";
/* ============ Cortado — Add a Bag (rich catalog form) ============ */
import { useState } from "react";
import { Icon } from "./ui";
import { BeanBag } from "./cards";
import { FlavorWheelPicker } from "./flavor-wheel";
import { SheetHeader, DonePanel } from "./sheet-chrome";
import { ROAST_LEVELS } from "@/lib/seed-data";
import type { AddBagInput } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label as UiLabel } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

export function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 600, color: "var(--espresso)", marginBottom: 10 }}>{children}</div>;
}

const BAG_COLORS = ["#b07a3c", "#c98a4a", "#a8434a", "#8a5a36", "#9a5f2e", "#4f3a2c", "#c07ba0", "#5a7a5a", "#5b6aa8"];

export function BagForm({
  onClose,
  backToBrew,
  onBack,
  onAddBag,
}: {
  onClose: () => void;
  backToBrew?: boolean;
  onBack?: () => void;
  onAddBag: (input: AddBagInput, backToBrew: boolean) => Promise<void>;
}) {
  const [f, setF] = useState({
    roaster: "",
    name: "",
    origin: "",
    farm: "",
    process: "Washed",
    roast: "Light",
    sca: 86,
    color: BAG_COLORS[1],
  });
  const [varieties, setVarieties] = useState<string[]>([]);
  const [varInput, setVarInput] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string | number) => setF((p) => ({ ...p, [k]: v }));

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
      await onAddBag(input, !!backToBrew);
      if (!backToBrew) setDone(true);
    } catch (e) {
      setPending(false);
      setError(e instanceof Error ? e.message : "Couldn't add that bag — please try again.");
    }
  };

  if (done) return <DonePanel title="Bag added to your shelf" sub={`${f.name} is ready to brew.`} />;

  const scoreColor = f.sca >= 90 ? "var(--sage)" : f.sca >= 87 ? "var(--caramel)" : "var(--mocha)";

  return (
    <>
      <SheetHeader kicker="Add a bag" onClose={onClose} onBack={backToBrew ? onBack : undefined} />
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
            <div className="display" style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.1 }}>
              {f.name || "New coffee"}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--mocha)" }}>
              {f.roaster || "Roaster"}
              {f.origin ? " · " + f.origin : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            {BAG_COLORS.slice(0, 5).map((c) => (
              <button
                key={c}
                onClick={() => set("color", c)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: c,
                  border: f.color === c ? "2px solid var(--espresso)" : "2px solid transparent",
                }}
              />
            ))}
          </div>
        </div>

        <TwoCol>
          <Field label="Roaster" value={f.roaster} onChange={(v) => set("roaster", v)} placeholder="Ember & Oak" />
          <Field label="Coffee name" value={f.name} onChange={(v) => set("name", v)} placeholder="Idido" />
        </TwoCol>
        <TwoCol>
          <Field label="Origin" value={f.origin} onChange={(v) => set("origin", v)} placeholder="Gedeb, Ethiopia" />
          <Field label="Farm / producer" value={f.farm} onChange={(v) => set("farm", v)} placeholder="Idido Station" />
        </TwoCol>

        {/* Varieties */}
        <Label>
          Variety <span style={{ color: "var(--mocha)", fontWeight: 400 }}>· add one or more</span>
        </Label>
        <div style={{ display: "flex", gap: 8, marginBottom: varieties.length ? 10 : 18 }}>
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
            className="h-auto flex-1 rounded-[10px] border-[var(--line)] bg-[var(--surface)] px-[13px] py-[11px] text-[14.5px] text-[var(--espresso)]"
          />
          <Button variant="outline" onClick={addVariety}>
            Add
          </Button>
        </div>
        {varieties.length > 0 && (
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 18 }}>
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
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--coffee)",
                }}
              >
                {v}
                <button
                  onClick={() => setVarieties((a) => a.filter((x) => x !== v))}
                  style={{ display: "inline-flex", color: "var(--mocha)" }}
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
        <ChipRow options={ROAST_LEVELS} value={f.roast} onChange={(v) => set("roast", v)} />

        {/* SCA score slider */}
        <div style={{ height: 22 }} />
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <Label>SCA cupping score</Label>
          <span className="display" style={{ fontSize: 26, fontWeight: 700, color: scoreColor }}>
            {Number(f.sca).toFixed(1)}
          </span>
        </div>
        <Slider
          value={[Number(f.sca)]}
          min={80}
          max={92}
          step={0.5}
          onValueChange={([v]) => set("sca", String(v))}
          aria-label="SCA cupping score"
          aria-valuetext={Number(f.sca).toFixed(1)}
          className="mt-2.5 [&_[data-slot=slider-range]]:bg-transparent [&_[data-slot=slider-thumb]]:size-6 [&_[data-slot=slider-thumb]]:border-[3px] [&_[data-slot=slider-thumb]]:border-[var(--espresso)] [&_[data-slot=slider-thumb]]:bg-[var(--surface)] [&_[data-slot=slider-thumb]]:shadow-[var(--shadow-md)] [&_[data-slot=slider-track]]:bg-[linear-gradient(90deg,var(--mocha),var(--caramel),var(--sage))]"
        />
        <div
          style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--mocha)", marginTop: 4 }}
          className="mono"
        >
          <span>80 · GOOD</span>
          <span>85 · VERY GOOD</span>
          <span>90+ · OUTSTANDING</span>
        </div>

        {/* SCA tasting notes — full flavor wheel */}
        <div style={{ height: 22 }} />
        <Label>
          SCA tasting notes <span style={{ color: "var(--mocha)", fontWeight: 400 }}>· the roaster's notes, by the wheel</span>
        </Label>
        <FlavorWheelPicker value={notes} onChange={setNotes} max={10} />
      </div>
      <div style={{ padding: "14px 20px", borderTop: "1px solid var(--line-soft)" }}>
        {error && (
          <div role="alert" style={{ marginBottom: 10, fontSize: 13, color: "var(--berry, #a8434a)" }}>
            {error}
          </div>
        )}
        <Button onClick={save} disabled={!valid || pending} className="w-full">
          <Icon name="check" size={18} color="currentColor" />{" "}
          {pending ? "Saving…" : backToBrew ? "Save bag & continue" : "Add to my shelf"}
        </Button>
      </div>
    </>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={{ display: "block", marginBottom: 18, flex: 1 }}>
      <UiLabel style={{ fontSize: 13, fontWeight: 600, color: "var(--espresso)", marginBottom: 10 }}>{label}</UiLabel>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-auto rounded-[10px] border-[var(--line)] bg-[var(--surface)] px-[13px] py-[11px] text-[14.5px] text-[var(--espresso)]"
      />
    </label>
  );
}

export function TwoCol({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12 }} className="two-col">
      {children}
    </div>
  );
}

export function ChipRow({
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
        <button
          key={o}
          onClick={() => onChange(o)}
          style={{
            padding: "8px 13px",
            borderRadius: 99,
            fontSize: 12.5,
            fontWeight: 600,
            background: value === o ? "var(--espresso)" : "var(--surface)",
            color: value === o ? "var(--cream)" : "var(--coffee)",
            border: "1px solid " + (value === o ? "var(--espresso)" : "var(--line)"),
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
