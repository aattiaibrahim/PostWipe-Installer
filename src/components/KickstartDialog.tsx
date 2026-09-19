import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { create } from "zustand";
import type { Os } from "../types/catalog";
import {
  DEVICE_GROUPS,
  KICKSTART_DEFAULTS,
  deviceOs,
  recommend,
  visibleSteps,
  type KickstartAnswers,
  type KickstartOption,
  type KickstartStep,
} from "../lib/kickstart";
import { downloadApps } from "./DownloadChoiceSheet";
import { useCatalogStore } from "../state/catalogStore";
import { useAccountStore } from "../state/accountStore";
import { useSelectionStore } from "../state/selectionStore";
import { AppIcon } from "./AppIcon";
import { CategoryIcon } from "../lib/categoryIcons";

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

/** Always the first screen; rendered as segmented rows rather than answer cards. */
const DEVICE_STEP: KickstartStep = {
  id: "device",
  title: "First, tell us about your computer",
  subtitle: "This decides which downloads fit and which hardware tools apply.",
  options: [],
};

type Phase = { kind: "step"; index: number } | { kind: "review" } | { kind: "done"; count: number };

/** Whether an option leads to anything on this OS. Options that only unlock a later step (or,
 *  like "Keep it simple", only change how the list is built) carry no apps, so they always show. */
function optionAvailable(option: KickstartOption, available: Set<string>) {
  return option.apps.length === 0 || option.apps.some((id) => available.has(id));
}

export function KickstartDialog() {
  const open = useKickstart((s) => s.open);
  const close = useKickstart((s) => s.close);
  const catalog = useCatalogStore((s) => s.catalog);
  const appOs = useCatalogStore((s) => s.osFilter);
  const system = useCatalogStore((s) => s.system);
  const setOsFilter = useCatalogStore((s) => s.setOsFilter);
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
    // Pre-fill this computer's OS and processor (detected on launch); they only confirm.
    const { osFilter, system } = useCatalogStore.getState();
    const cpu = system && system.os === osFilter && system.cpuVendor !== "unknown" ? [system.cpuVendor] : [];
    setAnswers({ ...KICKSTART_DEFAULTS, os: [osFilter], cpu });
    setPhase({ kind: "step", index: 0 });
    setUnchecked(new Set());
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const os = deviceOs(answers);

  const available = useMemo(() => {
    const ids = new Set<string>();
    for (const app of catalog?.categories.flatMap((c) => c.apps) ?? []) {
      if (app.kind === "download" && app.platforms[os]?.resolver) ids.add(app.id);
    }
    return ids;
  }, [catalog, os]);

  const steps = [
    DEVICE_STEP,
    ...visibleSteps(answers)
      .map((step) => ({ ...step, options: step.options.filter((o) => optionAvailable(o, available)) }))
      .filter((step) => step.options.length > 0),
  ];
  const recommendations = catalog ? recommend(catalog, answers) : [];

  /** Picking a different OS clears the processor, whose choices differ per OS — unless it's
   *  this computer's OS again, where the detected processor comes back. */
  const chooseDevice = (group: "os" | "cpu", choice: string) =>
    setAnswers((a) => {
      if (group !== "os" || a.os?.[0] === choice) return { ...a, [group]: [choice] };
      const detected = system && system.os === choice && system.cpuVendor !== "unknown" ? [system.cpuVendor] : [];
      return { ...a, os: [choice], cpu: detected };
    });

  /** Kickstart's OS answer becomes the app's OS, so the downloads and any selection match it. */
  const adoptOs = () => {
    if (appOs !== os) setOsFilter(os);
  };
  const chosen = recommendations.filter((r) => !unchecked.has(r.app.id));
  const osName = os === "windows" ? "Windows" : "macOS";

  const appsById = useMemo(
    () => new Map((catalog?.categories.flatMap((c) => c.apps) ?? []).map((a) => [a.id, a])),
    [catalog],
  );

  /** The review screen groups picks under their catalog category, in catalog order. */
  const reviewGroups = useMemo(() => {
    const byId = new Map(recommendations.map((r) => [r.app.id, r]));
    return (catalog?.categories ?? [])
      .map((category) => ({
        id: category.id,
        name: category.name,
        picks: category.apps.map((a) => byId.get(a.id)).filter((r): r is (typeof recommendations)[number] => !!r),
      }))
      .filter((g) => g.picks.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, recommendations.map((r) => r.app.id).join()]);

  const toggleOption = (stepId: string, optionId: string, single: boolean) =>
    setAnswers((a) => {
      const current = a[stepId] ?? [];
      if (single) return { ...a, [stepId]: [optionId] };
      return {
        ...a,
        [stepId]: current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId],
      };
    });

  async function downloadAll() {
    if (!chosen.length) return;
    setBusy(true);
    const ids = chosen.map((r) => r.app.id);
    adoptOs();
    if (signedIn && saveAsSet) {
      // The set records the picks for both platforms that exist, so it also works on a Mac.
      const onOs = (target: Os) =>
        catalog!.categories
          .flatMap((c) => c.apps)
          .filter((a) => ids.includes(a.id) && a.platforms[target])
          .map((a) => a.id);
      saveSet("Kickstart", { windows: onOs("windows"), macos: onOs("macos") });
    }
    // Asks "install for me or just download?"; closing that sheet returns to the review.
    const started = await downloadApps(ids, os);
    setBusy(false);
    if (started === null) return;
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
                  {step.id === "device" && (
                    <div className="kickstart__device">
                      {DEVICE_GROUPS.map((group) => {
                        const choices = group.choices(os);
                        if (!choices.length) return null;
                        return (
                          <div key={group.id} className="kickstart__device-row">
                            <span className="kickstart__device-label">{group.label}</span>
                            <div className="os-picker kickstart__segments" role="radiogroup" aria-label={group.label}>
                              {choices.map((choice) => {
                                const on = answers[group.id]?.[0] === choice.id;
                                return (
                                  <button
                                    key={choice.id}
                                    role="radio"
                                    aria-checked={on}
                                    className={`os-picker__tile${on ? " os-picker__tile--active" : ""}`}
                                    onClick={() => chooseDevice(group.id, choice.id)}
                                  >
                                    {on && (
                                      // A div, not a span: `.os-picker__tile span` makes spans position:relative
                                      // (for the label), which collapsed this absolutely-sized lens to 0×0.
                                      <motion.div
                                        className="os-picker__indicator"
                                        layoutId={`kickstart-${group.id}`}
                                        transition={{ type: "spring", stiffness: 600, damping: 44 }}
                                      />
                                    )}
                                    <span>{choice.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                            {group.id === "cpu" && system && system.os === os && system.cpuName && (
                              <span className="kickstart__detected">Detected: {system.cpuName}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="kickstart__options">
                    {step.options.map((option) => {
                      const on = answers[step.id]?.includes(option.id) ?? false;
                      return (
                        <button
                          key={option.id}
                          className={`kickstart__option${on ? " kickstart__option--on" : ""}`}
                          aria-pressed={on}
                          onClick={() => toggleOption(step.id, option.id, !!step.single)}
                        >
                          <span className="kickstart__check" aria-hidden="true">
                            {on ? "✓" : ""}
                          </span>
                          <span className="kickstart__option-text">
                            <strong>{option.label}</strong>
                            {option.hint && <span>{option.hint}</span>}
                          </span>
                          {/* Real logos for what the answer adds, so "Riot" shows the Riot mark
                              instead of just a word; answers that only unlock later questions
                              show their category glyph instead. */}
                          <span className="kickstart__logos" aria-hidden="true">
                            {option.apps.length > 0 || option.preview
                              ? (option.apps.length > 0 ? option.apps : (option.preview ?? []))
                                  .filter((id) => available.has(id))
                                  .slice(0, 3)
                                  .map((id) => {
                                    const app = appsById.get(id);
                                    return app ? (
                                      <AppIcon key={id} appId={id} name={app.name} domain={app.domain} className="kickstart__logo" />
                                    ) : null;
                                  })
                              : option.icon && <CategoryIcon categoryId={option.icon} className="kickstart__glyph" />}
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
                  <div className="kickstart__review-groups">
                    {reviewGroups.map((group) => (
                      <section key={group.id} className="kickstart__review-group">
                        <h4 className="kickstart__review-heading">{group.name}</h4>
                        <ul className="kickstart__review">
                          {group.picks.map(({ app, reasons }) => {
                            const on = !unchecked.has(app.id);
                            return (
                              <li key={app.id}>
                                <label className={`kickstart__pick${on ? "" : " kickstart__pick--off"}`} title={reasons.join(" · ")}>
                                  <input
                                    type="checkbox"
                                    className="round-check"
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
                      </section>
                    ))}
                  </div>
                  {signedIn && recommendations.length > 0 && (
                    <label className="kickstart__save">
                      <input type="checkbox" className="round-check" checked={saveAsSet} onChange={(e) => setSaveAsSet(e.target.checked)} />
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
                      adoptOs();
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
