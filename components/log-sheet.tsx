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
import type { AddBagInput, Bean, LogBrewInput, Tasting, TastingAssessment, UpdateBagInput, UpdateBrewInput } from "@/lib/types";
import { TastingAssessmentFields, EMPTY_ASSESSMENT } from "./tasting-assessment-fields";

// Section header inside the sheets (was the shared `Label`). Accepts an optional
// `id` so a section prompt can label an associated control via aria-labelledby.
function SectionLabel({ id, children }: { id?: string; children: React.ReactNode }) {
  return <div id={id} style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--espresso)", marginBottom: 10 }}>{children}</div>;
}

// A controlled ghost-Button expander used by both "Add brew details" and "Add
// tasting notes". The open state stays owned by the caller (BrewFlow reads it in
// `submit`); this only renders the toggle + the fade-up content when open.
function ToggleSection({
  open,
  onToggle,
  label,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="mb-1 h-auto gap-2 p-0 text-[length:var(--text-sm)] font-semibold text-[var(--coffee)] hover:bg-transparent"
      >
        <Icon name={open ? "close" : "plus"} size={15} color="var(--mocha)" /> {open ? "Hide" : "Add"} {label}
      </Button>
      {open && (
        <div className="fade-up" style={{ marginTop: 12 }}>
          {children}
        </div>
      )}
    </>
  );
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

  // a11y: on an INTRA-sheet view switch (brew↔bag), the focused control in the
  // old view unmounts and focus would fall to <body>. Move it back to the dialog
  // container so keyboard/SR users stay oriented. Skip the initial open (Radix
  // handles that focus).
  const contentRef = useRef<HTMLDivElement>(null);
  const openedRef = useRef(false);
  useEffect(() => {
    if (!open) { openedRef.current = false; return; }
    if (!openedRef.current) { openedRef.current = true; return; }
    contentRef.current?.focus();
  }, [view, open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        ref={contentRef}
        tabIndex={-1}
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
  const [showAssess, setShowAssess] = useState(false);
  const [assessment, setAssessment] = useState<TastingAssessment>(EMPTY_ASSESSMENT);
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
      const payload = showAssess ? { ...params, assessment } : params;
      if (isEdit && onUpdateBrew) await onUpdateBrew({ id: editBrew!.id, rating, ...payload });
      else await onLogBrew({ beanId, rating, ...payload });
      setDone(true);
      // Quick path auto-closes; if the user filled an assessment, let them dismiss
      // manually so they can confirm their entries.
      if (!showAssess) timerRef.current = setTimeout(onClose, 1300);
    } catch (e) {
      setPending(false);
      setError(e instanceof Error ? e.message : "Couldn't save that brew — please try again.");
    }
  };

  if (done)
    return (
      <>
        <DonePanel
          title={isEdit ? "Brew updated!" : "Brew logged!"}
          sub={`Your ${bean?.name ?? "coffee"} brew is in your journal.`}
        />
        {showAssess && (
          <div style={{ padding: "0 20px calc(20px + env(safe-area-inset-bottom))" }}>
            <Button onClick={onClose} className="w-full">Done</Button>
          </div>
        )}
      </>
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
            className="h-auto gap-1 p-0 text-[length:var(--text-xs)] font-semibold text-[var(--caramel-deep)] no-underline hover:no-underline"
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
                <div className="display" style={{ fontWeight: 600, fontSize: "var(--text-sm)", lineHeight: 1.1, marginTop: 9 }}>
                  {b.name}
                </div>
                <div
                  style={{
                    fontSize: "var(--text-2xs)",
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
              fontSize: "var(--text-xs)",
              fontWeight: 600,
            }}
          >
            <Icon name="plus" size={22} color="var(--mocha)" /> Add a bag
          </button>
        </div>

        {/* Rating */}
        <SectionLabel id="brew-rating-label">How was it?</SectionLabel>
        <div role="group" aria-labelledby="brew-rating-label" style={{ display: "flex", justifyContent: "center", padding: "6px 0 20px" }}>
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
                display: "inline-flex",
                alignItems: "center",
                minHeight: 44,
                padding: "8px 14px",
                borderRadius: 99,
                fontSize: "var(--text-sm)",
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
        <ToggleSection open={showParams} onToggle={() => setShowParams((s) => !s)} label="brew details">
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <MiniField label="Dose (g)" value={dose} onChange={setDose} />
            <MiniField label="Ratio (1:)" value={ratio} onChange={setRatio} />
            <MiniField label="Temp (°C)" value={temp} onChange={setTemp} />
          </div>
        </ToggleSection>

        {/* Note */}
        <SectionLabel>
          Notes <span style={{ color: "var(--mocha)", fontWeight: 400 }}>· optional</span>
        </SectionLabel>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="How did it taste today? How'd you dial it in?"
          className="resize-y rounded-[var(--r-md)] border-[var(--line)] bg-[var(--surface)] text-[16px] leading-[1.55] md:text-[length:var(--text-base)]"
        />

        {/* Assessment capture is log-only for v1: editing can't load an existing
            assessment (Tasting carries none), so showing the expander on edit
            would overwrite/null prior intensities. Hide it in edit mode. */}
        {!isEdit && (
          <div style={{ marginTop: 18 }}>
            <ToggleSection open={showAssess} onToggle={() => setShowAssess((s) => !s)} label="tasting notes">
              <TastingAssessmentFields value={assessment} onChange={setAssessment} />
            </ToggleSection>
          </div>
        )}
      </div>
      <div style={{ padding: "14px 20px calc(14px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--line-soft)" }}>
        {error && (
          <div role="alert" style={{ marginBottom: 10, fontSize: "var(--text-sm)", color: "var(--berry)" }}>
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
      <div className="mono" style={{ fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--mocha)", marginBottom: 5 }}>
        {label}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className="h-auto rounded-[10px] border-[var(--line)] bg-[var(--surface)] px-[11px] py-[9px] text-[16px] font-semibold md:text-[length:var(--text-base)]"
      />
    </label>
  );
}
