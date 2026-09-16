import { useAccountStore } from "../state/accountStore";
import { useAccountDialog } from "./AccountDialog";

/** The account row at the top of Settings: a sign-in prompt, or who's signed in and whether
 *  their favorites are in sync. */
export function AccountSection() {
  const available = useAccountStore((s) => s.available);
  const user = useAccountStore((s) => s.user);
  const sync = useAccountStore((s) => s.sync);
  const syncError = useAccountStore((s) => s.syncError);
  const open = useAccountDialog((s) => s.open);

  if (!available) return null;

  if (!user) {
    return (
      <div className="settings-panel__row account-section">
        <button className="account-section__signin" onClick={() => open("signIn")}>
          <span className="account-avatar account-avatar--empty" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
            </svg>
          </span>
          <span className="account-section__text">
            <strong>Sign in</strong>
            <span>Sync favorites and sets</span>
          </span>
        </button>
      </div>
    );
  }

  const status =
    sync === "error" ? syncError ?? "Sync failed" : sync === "saving" ? "Syncing…" : user.twoFactorEnabled ? "Synced · 2FA on" : "Synced · 2FA off";

  return (
    <div className="settings-panel__row account-section">
      <button className="account-section__signin" onClick={() => open("manage")} title="Manage account">
        <span className="account-avatar" aria-hidden="true">
          {(user.name || user.email).charAt(0).toUpperCase()}
        </span>
        <span className="account-section__text">
          <strong>{user.name || user.email}</strong>
          <span className={sync === "error" ? "account-section__status--error" : undefined}>{status}</span>
        </span>
      </button>
    </div>
  );
}
