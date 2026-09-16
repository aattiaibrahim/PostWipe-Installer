import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import QRCode from "qrcode";
import { create } from "zustand";
import * as api from "../lib/accountCommands";
import { useAccountStore } from "../state/accountStore";

export type AccountView =
  | "signIn"
  | "signUp"
  | "code"
  | "offerTwoFactor"
  | "setupPassword"
  | "setupScan"
  | "setupCodes"
  | "manage"
  | "disableTwoFactor"
  | "delete";

interface DialogState {
  view: AccountView | null;
  open: (view: AccountView) => void;
  close: () => void;
}

export const useAccountDialog = create<DialogState>((set) => ({
  view: null,
  open: (view) => set({ view }),
  close: () => set({ view: null }),
}));

const MIN_PASSWORD = 10;

function Field({
  id,
  label,
  children,
  hint,
}: {
  id: string;
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="account-field" htmlFor={id}>
      <span className="account-field__label">{label}</span>
      {children}
      {hint && <span className="account-field__hint">{hint}</span>}
    </label>
  );
}

/** Pulls the base32 secret out of an otpauth:// URI, for people who can't scan the QR. */
function secretFrom(uri: string): string {
  try {
    return (new URL(uri).searchParams.get("secret") ?? "").replace(/(.{4})/g, "$1 ").trim();
  } catch {
    return "";
  }
}

export function AccountDialog() {
  const view = useAccountDialog((s) => s.view);
  const open = useAccountDialog((s) => s.open);
  const close = useAccountDialog((s) => s.close);
  const user = useAccountStore((s) => s.user);
  const onSignedIn = useAccountStore((s) => s.onSignedIn);
  const signOutAccount = useAccountStore((s) => s.signOut);
  const deleteAccountAction = useAccountStore((s) => s.deleteAccount);
  const setUser = useAccountStore((s) => s.setUser);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [setup, setSetup] = useState<api.TwoFactorSetup | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");
  const firstInput = useRef<HTMLInputElement>(null);

  // Every view change clears the transient error and focuses the first field.
  useEffect(() => {
    setError(null);
    setCode("");
    requestAnimationFrame(() => firstInput.current?.focus());
  }, [view]);

  useEffect(() => {
    if (!view) {
      // Never leave a typed password or a 2FA secret sitting in memory after closing.
      setPassword("");
      setCode("");
      setSetup(null);
      setQr(null);
      setUseBackup(false);
      setConfirmDelete("");
      return;
    }
    function onKey(e: KeyboardEvent) {
      // Backup codes are shown exactly once — Esc must not skip past them unsaved.
      if (e.key === "Escape" && view !== "setupCodes") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, close]);

  useEffect(() => {
    if (!setup) return;
    QRCode.toDataURL(setup.totpURI, { margin: 1, width: 200, color: { dark: "#0b0c14", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [setup]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(api.errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const submitSignIn = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const result = await api.signIn(email, password);
      setPassword("");
      if (result.needsTwoFactor) {
        open("code");
        return;
      }
      await onSignedIn(result.user);
      close();
    });
  };

  const submitSignUp = (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
      return;
    }
    void run(async () => {
      const created = await api.signUp(email, password, name || email.split("@")[0]);
      await onSignedIn(created);
      // Keep the password in memory for one more step: enabling 2FA requires it.
      open("offerTwoFactor");
    });
  };

  const submitCode = (e?: FormEvent) => {
    e?.preventDefault();
    if (!code.trim()) return;
    void run(async () => {
      const signedIn = await api.verifyCode(code, useBackup);
      await onSignedIn(signedIn);
      close();
    });
  };

  const startSetup = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const result = await api.enableTwoFactor(password);
      setPassword("");
      setSetup(result);
      open("setupScan");
    });
  };

  const confirmSetup = (e?: FormEvent) => {
    e?.preventDefault();
    if (!code.trim()) return;
    void run(async () => {
      const updated = await api.verifyCode(code, false);
      setUser(updated);
      open("setupCodes");
    });
  };

  const submitDisable = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api.disableTwoFactor(password);
      setPassword("");
      setUser(await api.accountStatus());
      open("manage");
    });
  };

  const submitDelete = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await deleteAccountAction(password);
      close();
    });
  };

  // Authenticator codes are 6 digits: submit the moment the sixth one lands.
  const onCodeChange = (value: string, submit: () => void) => {
    const next = useBackup ? value : value.replace(/\D/g, "").slice(0, 6);
    setCode(next);
    if (!useBackup && next.length === 6) requestAnimationFrame(submit);
  };

  let title = "";
  let body: ReactNode = null;

  switch (view) {
    case "signIn":
      title = "Sign in";
      body = (
        <form className="account-form" onSubmit={submitSignIn}>
          <p className="account-lede">Sync your favorites, sets and settings to any PC you set up.</p>
          <Field id="account-email" label="Email">
            <input ref={firstInput} id="account-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field id="account-password" label="Password">
            <input id="account-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <button className="account-primary" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="account-switch">
            New here?{" "}
            <button type="button" className="account-link" onClick={() => open("signUp")}>
              Create an account
            </button>
          </p>
        </form>
      );
      break;

    case "signUp":
      title = "Create an account";
      body = (
        <form className="account-form" onSubmit={submitSignUp}>
          <p className="account-lede">
            Free. Stores your email, a securely hashed password, and your favorites. Delete it any time from Settings.
          </p>
          <Field id="account-name" label="Name (optional)">
            <input ref={firstInput} id="account-name" type="text" autoComplete="nickname" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id="account-email-new" label="Email">
            <input id="account-email-new" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field
            id="account-password-new"
            label="Password"
            hint={`At least ${MIN_PASSWORD} characters. There's no email reset yet, so use a password manager.`}
          >
            <input id="account-password-new" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <button className="account-primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
          <p className="account-switch">
            Already have one?{" "}
            <button type="button" className="account-link" onClick={() => open("signIn")}>
              Sign in
            </button>
          </p>
        </form>
      );
      break;

    case "code":
      title = "Two-factor code";
      body = (
        <form className="account-form" onSubmit={submitCode}>
          <p className="account-lede">
            {useBackup
              ? "Enter one of the backup codes you saved when you set up two-factor. Each works once."
              : "Enter the 6-digit code from your authenticator app."}
          </p>
          <Field id="account-code" label={useBackup ? "Backup code" : "Code"}>
            <input
              ref={firstInput}
              id="account-code"
              className={useBackup ? undefined : "account-code"}
              inputMode={useBackup ? "text" : "numeric"}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => onCodeChange(e.target.value, submitCode)}
            />
          </Field>
          <button className="account-primary" type="submit" disabled={busy || !code.trim()}>
            {busy ? "Checking…" : "Verify"}
          </button>
          <p className="account-switch">
            <button
              type="button"
              className="account-link"
              onClick={() => {
                setUseBackup((b) => !b);
                setCode("");
                requestAnimationFrame(() => firstInput.current?.focus());
              }}
            >
              {useBackup ? "Use my authenticator app instead" : "Lost your phone? Use a backup code"}
            </button>
          </p>
        </form>
      );
      break;

    case "offerTwoFactor":
      title = "Protect your account";
      body = (
        <div className="account-form">
          <p className="account-lede">
            Add two-factor so a leaked password alone can't get anyone into your account. It takes a minute with any
            authenticator app — 1Password, Google Authenticator, Authy, or your phone's built-in one.
          </p>
          <button className="account-primary" disabled={busy} onClick={() => void run(async () => {
            const result = await api.enableTwoFactor(password);
            setPassword("");
            setSetup(result);
            open("setupScan");
          })}>
            Set up two-factor
          </button>
          <button className="account-secondary" onClick={() => { setPassword(""); close(); }}>
            Not now
          </button>
        </div>
      );
      break;

    case "setupPassword":
      title = "Set up two-factor";
      body = (
        <form className="account-form" onSubmit={startSetup}>
          <p className="account-lede">Confirm your password to continue.</p>
          <Field id="account-password-2fa" label="Password">
            <input ref={firstInput} id="account-password-2fa" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <button className="account-primary" type="submit" disabled={busy}>
            {busy ? "Starting…" : "Continue"}
          </button>
        </form>
      );
      break;

    case "setupScan":
      title = "Scan with your authenticator";
      body = (
        <form className="account-form" onSubmit={confirmSetup}>
          <div className="account-qr">
            {qr ? <img src={qr} alt="QR code for your authenticator app" width={176} height={176} /> : <div className="account-qr__placeholder" />}
          </div>
          {setup && (
            <p className="account-secret">
              Can't scan? Enter this key: <code>{secretFrom(setup.totpURI)}</code>
            </p>
          )}
          <Field id="account-code-setup" label="Then enter the 6-digit code it shows">
            <input
              ref={firstInput}
              id="account-code-setup"
              className="account-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => onCodeChange(e.target.value, confirmSetup)}
            />
          </Field>
          <button className="account-primary" type="submit" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Turn on two-factor"}
          </button>
        </form>
      );
      break;

    case "setupCodes":
      title = "Save your backup codes";
      body = (
        <div className="account-form">
          <p className="account-lede">
            If you lose your phone, each of these gets you in once. They won't be shown again — put them in your password
            manager.
          </p>
          <ul className="account-codes">
            {setup?.backupCodes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          <button
            className="account-secondary"
            onClick={() => {
              void navigator.clipboard.writeText(setup?.backupCodes.join("\n") ?? "").then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy all codes"}
          </button>
          <button className="account-primary" onClick={close}>
            I've saved them
          </button>
        </div>
      );
      break;

    case "manage":
      title = "Your account";
      body = user && (
        <div className="account-form">
          <div className="account-identity">
            <span className="account-avatar">{(user.name || user.email).charAt(0).toUpperCase()}</span>
            <div>
              <strong>{user.name || user.email}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <div className="account-row">
            <div>
              <strong>Two-factor</strong>
              <span>{user.twoFactorEnabled ? "On — your authenticator is required to sign in." : "Off"}</span>
            </div>
            {user.twoFactorEnabled ? (
              <button className="account-secondary account-secondary--small" onClick={() => open("disableTwoFactor")}>
                Turn off
              </button>
            ) : (
              <button className="account-primary account-primary--small" onClick={() => open("setupPassword")}>
                Set up
              </button>
            )}
          </div>
          <button className="account-secondary" disabled={busy} onClick={() => void run(async () => {
            await signOutAccount();
            close();
          })}>
            Sign out
          </button>
          <button className="account-danger-link" onClick={() => open("delete")}>
            Delete account…
          </button>
        </div>
      );
      break;

    case "disableTwoFactor":
      title = "Turn off two-factor";
      body = (
        <form className="account-form" onSubmit={submitDisable}>
          <p className="account-lede">Your account will be protected by your password alone.</p>
          <Field id="account-password-off" label="Password">
            <input ref={firstInput} id="account-password-off" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <button className="account-danger" type="submit" disabled={busy}>
            {busy ? "Turning off…" : "Turn off two-factor"}
          </button>
          <button type="button" className="account-secondary" onClick={() => open("manage")}>
            Cancel
          </button>
        </form>
      );
      break;

    case "delete":
      title = "Delete account";
      body = (
        <form className="account-form" onSubmit={submitDelete}>
          <p className="account-lede">
            This permanently deletes your account, favorites, sets and synced settings from the server. It can't be undone.
            Apps already on this PC aren't affected.
          </p>
          <Field id="account-delete-confirm" label='Type "delete" to confirm'>
            <input ref={firstInput} id="account-delete-confirm" autoComplete="off" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} />
          </Field>
          <Field id="account-password-delete" label="Password">
            <input id="account-password-delete" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <button className="account-danger" type="submit" disabled={busy || confirmDelete.trim().toLowerCase() !== "delete"}>
            {busy ? "Deleting…" : "Delete my account"}
          </button>
          <button type="button" className="account-secondary" onClick={() => open("manage")}>
            Cancel
          </button>
        </form>
      );
      break;
  }

  return createPortal(
    <AnimatePresence>
      {view && (
        <motion.div
          className="confirm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={() => view !== "setupCodes" && close()}
        >
          <motion.div
            className="confirm-dialog account-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-dialog-title"
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 460, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="account-dialog__head">
              <h3 id="account-dialog-title" className="confirm-dialog__title">
                {title}
              </h3>
              {view !== "setupCodes" && (
                <button className="account-close" onClick={close} aria-label="Close">
                  ✕
                </button>
              )}
            </div>
            {body}
            {error && (
              <p className="account-error" role="alert">
                {error}
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
