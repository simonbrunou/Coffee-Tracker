"use client";
/* ============ Cortado — Logging (Brew + Bag) ============ */
import { useEffect, useRef, useState } from "react";
import { useData } from "./data-context";
import { BeanBag } from "./cards";
import { BeanRating, Icon } from "./ui";
import { BagForm } from "./bag-form";
import { SheetHeader, DonePanel } from "./sheet-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AddBagInput, Bean, LogBrewInput, Tasting, UpdateBagInput, UpdateBrewInput } from "@/lib/types";

// Section header inside the sheets (was the shared `Label`).
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 600, color: "var(--espresso)", marginBottom: 10 }}>{children}</div>;
}

export function LogSheet({
  open,
  mode,
  onClose,
  presetBeanId,
  onLogBrew,
  onAddBag,
  editBrew,
  onUpdateBrew,
  editBag,
  onUpdateBag,
}: {
  open: boolean;
  mode: "brew" | "bag";
  onClose: () => void;
  presetBeanId: string | null;
  onLogBrew: (input: LogBrewInput) => Promise<void>;
  onAddBag: (input: AddBagInput, backToBrew: boolean) => Promise<void>;
  editBrew?: Tasting | null;
  onUpdateBrew?: (input: UpdateBrewInput) => Promise<void>;
  editBag?: Bean | null;
  onUpdateBag?: (input: UpdateBagInput) => Promise<void>;
}) {
  const [view, setView] = useState<"brew" | "bag">("brew");
  // Re-sync the view when the sheet opens, the mode changes, OR the preset
  // changes — the preset dep drives the "Save bag & continue" flow back to brew.
  useEffect(() => {
    if (open) setView(mode || "brew");
  }, [open, mode, presetBeanId]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "log-sheet flex flex-col gap-0 overflow-hidden p-0 shadow-[var(--shadow-lg)]",
          view === "bag" ? "log-sheet--bag" : "log-sheet--brew",
        )}
      >
        <DialogTitle className="sr-only">{view === "bag" ? "Add a bag" : "Log a brew"}</DialogTitle>
        <DialogDescription className="sr-only">
          {view === "bag"
            ? "Create a catalog record for a coffee bag."
            : "Log a brew you pulled from a bag on your shelf."}
        </DialogDescription>
        {view === "brew" ? (
          <BrewFlow
            presetBeanId={presetBeanId}
            onClose={onClose}
            onNewBag={() => setView("bag")}
            onLogBrew={onLogBrew}
            editBrew={editBrew}
            onUpdateBrew={onUpdateBrew}
          />
        ) : (
          <BagForm
            onClose={onClose}
            backToBrew={mode === "brew"}
            onBack={() => setView("brew")}
            onAddBag={onAddBag}
            editBag={editBag}
            onUpdateBag={onUpdateBag}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- QUICK BREW: bag → rating → method → note, all on one screen ---------- */
function BrewFlow({
  presetBeanId,
  onClose,
  onNewBag,
  onLogBrew,
  editBrew,
  onUpdateBrew,
}: {
  presetBeanId: string | null;
  onClose: () => void;
  onNewBag: () => void;
  onLogBrew: (input: LogBrewInput) => Promise<void>;
  editBrew?: Tasting | null;
  onUpdateBrew?: (input: UpdateBrewInput) => Promise<void>;
}) {
  const D = useData();
  const shelf = D.shelf();
  const isEdit = !!editBrew;
  const hadParams = !!editBrew && editBrew.dose !== "—";
  const [beanId, setBeanId] = useState<string | null>(editBrew?.beanId ?? presetBeanId ?? (shelf[0]?.id ?? null));
  const [rating, setRating] = useState(editBrew?.rating ?? 0);
  const [brew, setBrew] = useState(editBrew?.brew ?? "V60");
  const [note, setNote] = useState(editBrew?.note ?? "");
  const [showParams, setShowParams] = useState(hadParams);
  const [dose, setDose] = useState(hadParams ? editBrew!.dose.replace(/[^\d.]/g, "") : "15");
  const [ratio, setRatio] = useState(hadParams ? editBrew!.ratio.replace(/^1:/, "") : "16");
  const [temp, setTemp] = useState(hadParams ? editBrew!.temp.replace(/[^\d.]/g, "") : "94");
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  // Preset/edit bag resolves from the user's shelf (myShelf); logBrew requires
  // an owned bag, so the target is always on the shelf (optimistically prepended
  // by handleAddBag for the "& continue" hand-off).
  const bean = beanId ? shelf.find((b) => b.id === beanId) ?? null : null;

  // Await the write before showing success — a failed action surfaces a real
  // error instead of a false "Brew logged!". Only send brew params if the user
  // actually opened "Add brew details".
  const submit = async () => {
    if (!beanId || !rating || pending) return;
    setPending(true);
    setError(null);
    const params = {
      brew,
      note,
      dose: showParams ? dose + "g" : "—",
      ratio: showParams ? "1:" + ratio : "—",
      temp: showParams ? temp + "°C" : "—",
    };
    try {
      if (isEdit && onUpdateBrew) await onUpdateBrew({ id: editBrew!.id, rating, ...params });
      else await onLogBrew({ beanId, rating, ...params });
      setDone(true);
      timerRef.current = setTimeout(onClose, 1300);
    } catch (e) {
      setPending(false);
      setError(e instanceof Error ? e.message : "Couldn't save that brew — please try again.");
    }
  };

  if (done)
    return (
      <DonePanel
        title={isEdit ? "Brew updated!" : "Brew logged!"}
        sub={`Your ${bean?.name ?? "coffee"} brew is in your journal.`}
      />
    );

  return (
    <>
      <SheetHeader kicker={isEdit ? "Edit brew" : "Log a brew"} onClose={onClose} />
      <div style={{ overflowY: "auto", padding: 20, flex: 1 }}>
        {/* Bag selector — horizontal shelf */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <SectionLabel>From your shelf</SectionLabel>
          <Button
            variant="link"
            size="sm"
            onClick={onNewBag}
            className="h-auto gap-1 p-0 text-[12.5px] font-semibold text-[var(--caramel-deep)] no-underline hover:no-underline"
          >
            <Icon name="plus" size={14} color="var(--caramel-deep)" /> New bag
          </Button>
        </div>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", margin: "0 -20px 20px", padding: "0 20px 6px" }}>
          {shelf.map((b) => {
            const on = beanId === b.id;
            return (
              <button
                key={b.id}
                onClick={() => setBeanId(b.id)}
                aria-pressed={on}
                style={{
                  flexShrink: 0,
                  width: 132,
                  textAlign: "left",
                  padding: 11,
                  borderRadius: "var(--r-md)",
                  background: on ? "var(--caramel-soft)" : "var(--surface)",
                  border: "2px solid " + (on ? "var(--caramel)" : "var(--line-soft)"),
                  transition: "all 0.15s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <BeanBag color={b.color} size={34} />
                  {b.remaining != null && <RemainingRing pct={b.remaining} />}
                </div>
                <div className="display" style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.1, marginTop: 9 }}>
                  {b.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--mocha)",
                    marginTop: 2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {D.roaster(b.roasterId)?.name || b.roasterName}
                </div>
              </button>
            );
          })}
          <button
            onClick={onNewBag}
            aria-label="Add a bag to your shelf"
            style={{
              flexShrink: 0,
              width: 132,
              borderRadius: "var(--r-md)",
              border: "2px dashed var(--line)",
              background: "transparent",
              color: "var(--mocha)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            <Icon name="plus" size={22} color="var(--mocha)" /> Add a bag
          </button>
        </div>

        {/* Rating */}
        <SectionLabel>How was it?</SectionLabel>
        <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 20px" }}>
          <BeanRating value={rating} size={40} onChange={setRating} />
        </div>

        {/* Method */}
        <SectionLabel>Brew method</SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {D.BREW_METHODS.map((m) => (
            <button
              key={m}
              onClick={() => setBrew(m)}
              aria-pressed={brew === m}
              style={{
                padding: "8px 13px",
                borderRadius: 99,
                fontSize: 13,
                fontWeight: 600,
                background: brew === m ? "var(--espresso)" : "var(--surface)",
                color: brew === m ? "var(--cream)" : "var(--coffee)",
                border: "1px solid " + (brew === m ? "var(--espresso)" : "var(--line)"),
              }}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Optional params */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowParams((s) => !s)}
          className="mb-1 h-auto gap-2 p-0 text-[13px] font-semibold text-[var(--coffee)] hover:bg-transparent"
          style={{ marginBottom: showParams ? 12 : 4 }}
        >
          <Icon name={showParams ? "close" : "plus"} size={15} color="var(--mocha)" /> {showParams ? "Hide" : "Add"} brew details
        </Button>
        {showParams && (
          <div className="fade-up" style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <MiniField label="Dose (g)" value={dose} onChange={setDose} />
            <MiniField label="Ratio (1:)" value={ratio} onChange={setRatio} />
            <MiniField label="Temp (°C)" value={temp} onChange={setTemp} />
          </div>
        )}

        {/* Note */}
        <SectionLabel>
          Notes <span style={{ color: "var(--mocha)", fontWeight: 400 }}>· optional</span>
        </SectionLabel>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="How did it taste today? How'd you dial it in?"
          className="resize-y rounded-[var(--r-md)] border-[var(--line)] bg-[var(--surface)] text-[14.5px] leading-[1.55]"
        />
      </div>
      <div style={{ padding: "14px 20px", borderTop: "1px solid var(--line-soft)" }}>
        {error && (
          <div role="alert" style={{ marginBottom: 10, fontSize: 13, color: "var(--berry, #a8434a)" }}>
            {error}
          </div>
        )}
        <Button onClick={submit} disabled={!beanId || !rating || pending} className="w-full">
          <Icon name="check" size={18} color="currentColor" /> {pending ? "Saving…" : isEdit ? "Save changes" : "Log brew"}
        </Button>
      </div>
    </>
  );
}

function RemainingRing({ pct }: { pct: number }) {
  const r = 9,
    c = 2 * Math.PI * r;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" style={{ transform: "rotate(-90deg)" }}>
      <circle cx="12" cy="12" r={r} fill="none" stroke="var(--line)" strokeWidth="3" />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="var(--caramel)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
      />
    </svg>
  );
}

function MiniField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ flex: 1 }}>
      <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--mocha)", marginBottom: 5 }}>
        {label}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className="h-auto rounded-[10px] border-[var(--line)] bg-[var(--surface)] px-[11px] py-[9px] text-[14px] font-semibold"
      />
    </label>
  );
}
