import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { create } from "zustand";
import type { Os } from "../types/catalog";
import {
  KICKSTART_DEFAULTS,
  recommend,
  visibleSteps,
  type KickstartAnswers,
  type KickstartOption,
} from "../lib/kickstart";
import { isTauri, startDownload } from "../lib/tauriCommands";
import { useCatalogStore } from "../state/catalogStore";
import { useAccountStore } from "../state/accountStore";
import { useSelectionStore } from "../state/selectionStore";
import { AppIcon } from "./AppIcon";

interface KickstartState {
  open: boolean;
  show: () => void;
  close: () => void;
}

export const useKickstart = create<KickstartState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
}));

type Phase = { kind: "step"; index: number } | { kind: "review" } | { kind: "done"; count: number };

/** Whether an option leads to anything on this OS. The first step's options carry no apps of
 *  their own (they only unlock later steps), so they always show. */
function optionAvailable(option: KickstartOption, available: Set<string>) {
  return option.apps.length === 0 || option.apps.some((id) => available.has(id));
}

export function KickstartDialog() {
  const open = useKickstart((s) => s.open);
  const close = useKickstart((s) => s.close);
  const catalog = useCatalogStore((s) => s.catalog);
  const os = useCatalogStore((s) => s.osFilter);
  const signedIn = useAccountStore((s) => s.user !== null);
  const saveSet = useAccountStore((s) => s.saveSet);
  const replaceSelection = useSelectionStore((s) => s.replace);

  const [answers, setAnswers] = useState<KickstartAnswers>(KICKSTART_DEFAULTS);
  const [phase, setPhase] = useState<Phase>({ kind: "step", index: 0 });
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [saveAsSet, setSaveAsSet] = useState(true);
  const [busy, setBusy] = useState(false);

  // Start fresh each time it opens.
  useEffect(() => {
    if (!open) return;
    setAnswers(KICKSTART_DEFAULTS);
    setPhase({ kind: "step", index: 0 });
    setUnchecked(new Set());
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const available = useMemo(() => {
    const ids = new Set<string>();
    for (const app of catalog?.categories.flatMap((c) => c.apps) ?? []) {
      if (app.kind === "download" && app.platforms[os]?.resolver) ids.add(app.id);
    }
    return ids;
  }, [catalog, os]);

  const steps = visibleSteps(answers)
    .map((step) => ({ ...step, options: step.options.filter((o) => optionAvailable(o, available)) }))
    .filter((step) => step.options.length > 0);
  const recommendations = catalog ? recommend(catalog, os, answers) : [];
  const chosen = recommendations.filter((r) => !unchecked.has(r.app.id));
  const osName = os === "windows" ? "Windows" : "macOS";

  const toggleOption = (stepId: string, optionId: string) =>
    setAnswers((a) => {
      const current = a[stepId] ?? [];
      return {
        ...a,
        [stepId]: current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId],
      };
    });

  async function downloadAll() {
    if (!chosen.length) return;
    setBusy(true);
    const ids = chosen.map((r) => r.app.id);
    if (signedIn && saveAsSet) {
      // The set records the picks for both platforms that exist, so it also works on a Mac.
      const onOs = (target: Os) =>
        catalog!.categories
          .flatMap((c) => c.apps)
          .filter((a) => ids.includes(a.id) && a.platforms[target])
          .map((a) => a.id);
      saveSet("Kickstart", { windows: onOs("windows"), macos: onOs("macos") });
    }
    let started = 0;
    for (const id of ids) {
      try {
        if (isTauri) await startDownload(id, os);
        started++;
      } catch {
        // A failed start shows on that app's own row; keep queuing the rest.
      }
    }
    setBusy(false);
    setPhase({ kind: "done", count: started });
  }

  if (!catalog) return null;

  const step = phase.kind === "step" ? steps[Math.min(phase.index, steps.length - 1)] : null;
  const stepIndex = phase.kind === "step" ? Math.min(phase.index, steps.length - 1) : steps.length;
  const progress = phase.kind === "step" ? stepIndex / (steps.length + 1) : 1;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="confirm-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
          <motion.div
            className="confirm-dialog kickstart"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kickstart-title"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.94, opacity: 0, y: 14 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          >
            <div className="kickstart__top">
              <span className="kickstart__eyebrow">Kickstart · {osName}</span>
              <button className="account-close" onClick={close} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="kickstart__progress" aria-hidden="true">
              <motion.span animate={{ width: `${Math.round(progress * 100)}%` }} transition={{ ease: "easeOut", duration: 0.3 }} />
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {step && (
                <motion.div
                  key={step.id}
                  className="kickstart__body"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.18 }}
                >
                  <h3 id="kickstart-title" className="kickstart__title">
                    {step.title}
                  </h3>
                  {step.subtitle && <p className="kickstart__subtitle">{step.subtitle}</p>}
                  <div className="kickstart__options">
                    {step.options.map((option) => {
                      const on = answers[step.id]?.includes(option.id) ?? false;
                      return (
                        <button
                          key={option.id}
                          className={`kickstart__option${on ? " kickstart__option--on" : ""}`}
                          aria-pressed={on}
                          onClick={() => toggleOption(step.id, option.id)}
                        >
                          <span className="kickstart__check" aria-hidden="true">
                            {on ? "✓" : ""}
                          </span>
                          <span className="kickstart__option-text">
                            <strong>{option.label}</strong>
                            {option.hint && <span>{option.hint}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {phase.kind === "review" && (
                <motion.div
                  key="review"
                  className="kickstart__body"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.18 }}
                >
                  <h3 id="kickstart-title" className="kickstart__title">
                    Your setup
                  </h3>
                  <p className="kickstart__subtitle">
                    {recommendations.length
                      ? "Untick anything you don't want. Installers download to PostWipeDownloads for you to run."
                      : "Nothing picked yet — go back and choose a few things."}
                  </p>
                  <ul className="kickstart__review">
                    {recommendations.map(({ app, reasons }) => {
                      const on = !unchecked.has(app.id);
                      return (
                        <li key={app.id}>
                          <label className={`kickstart__pick${on ? "" : " kickstart__pick--off"}`}>
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() =>
                                setUnchecked((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(app.id)) next.delete(app.id);
                                  else next.add(app.id);
                                  return next;
                                })
                              }
                            />
                            <AppIcon appId={app.id} name={app.name} domain={app.domain} className="kickstart__icon" />
                            <span className="kickstart__pick-text">
                              <strong>{app.name}</strong>
                              <span>{reasons.join(" · ")}</span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  {signedIn && recommendations.length > 0 && (
                    <label className="kickstart__save">
                      <input type="checkbox" checked={saveAsSet} onChange={(e) => setSaveAsSet(e.target.checked)} />
                      Save as a set called “Kickstart” on my account
                    </label>
                  )}
                </motion.div>
              )}

              {phase.kind === "done" && (
                <motion.div key="done" className="kickstart__body kickstart__done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
                  <div className="kickstart__done-mark" aria-hidden="true">
                    ✓
                  </div>
                  <h3 id="kickstart-title" className="kickstart__title">
                    {phase.count} {phase.count === 1 ? "download" : "downloads"} started
                  </h3>
                  <p className="kickstart__subtitle">
                    Follow them with the download button at the top right. Each installer lands in PostWipeDownloads, ready to run.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="kickstart__footer">
              {phase.kind === "step" && (
                <>
                  <button className="account-secondary account-secondary--small" disabled={stepIndex === 0} onClick={() => setPhase({ kind: "step", index: stepIndex - 1 })}>
                    Back
                  </button>
                  <span className="kickstart__count">
                    {stepIndex + 1} of {steps.length}
                  </span>
                  <button
                    className="account-primary account-primary--small"
                    onClick={() => setPhase(stepIndex + 1 < steps.length ? { kind: "step", index: stepIndex + 1 } : { kind: "review" })}
                  >
                    {stepIndex + 1 < steps.length ? "Next" : `See my ${recommendations.length} apps`}
                  </button>
                </>
              )}
              {phase.kind === "review" && (
                <>
                  <button className="account-secondary account-secondary--small" onClick={() => setPhase({ kind: "step", index: steps.length - 1 })}>
                    Back
                  </button>
                  <button
                    className="account-link"
                    disabled={!chosen.length}
                    onClick={() => {
                      replaceSelection(chosen.map((r) => r.app.id));
                      close();
                    }}
                    title="Select these apps in the list instead of downloading now"
                  >
                    Select in list
                  </button>
                  <button className="account-primary account-primary--small" disabled={busy || !chosen.length} onClick={() => void downloadAll()}>
                    {busy ? "Starting…" : `Download ${chosen.length} ${chosen.length === 1 ? "app" : "apps"}`}
                  </button>
                </>
              )}
              {phase.kind === "done" && (
                <button className="account-primary account-primary--small kickstart__finish" onClick={close}>
                  Done
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
