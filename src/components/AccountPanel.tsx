import { useAccountStore } from "../state/accountStore";
import { useCatalogStore } from "../state/catalogStore";
import { useAccountDialog } from "./AccountDialog";
import { BetaPasswordWarning } from "./BetaPasswordWarning";

/** What the account bubble in the bottom-left dock opens. The longer flows (sign-up form, 2FA
 *  QR code, backup codes) happen in the account dialog; this panel is the at-a-glance view. */
export function AccountPanel() {
  const available = useAccountStore((s) => s.available);
  const user = useAccountStore((s) => s.user);
  const favorites = useAccountStore((s) => s.profile.favorites.length);
  const sets = useAccountStore((s) => s.profile.sets.length);
  const sync = useAccountStore((s) => s.sync);
  const syncError = useAccountStore((s) => s.syncError);
  const signOut = useAccountStore((s) => s.signOut);
  const openDialog = useAccountDialog((s) => s.open);
  const closeDock = useCatalogStore((s) => s.setDockView);

  const open = (view: Parameters<typeof openDialog>[0]) => {
    closeDock(null);
    openDialog(view);
  };

  if (!available) {
    return (
      <div className="account-panel">
        <p className="account-lede">Accounts are available in the desktop app.</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="account-panel">
        <h4 className="account-panel__title">Your account</h4>
        <ul className="account-panel__perks">
          <li>Star apps to keep a favorites list</li>
          <li>Save sets of apps to reinstall in one go</li>
          <li>Theme and settings follow you to every PC</li>
        </ul>
        <BetaPasswordWarning />
        <button className="account-primary" onClick={() => open("signUp")}>
          Create account
        </button>
        <button className="account-secondary" onClick={() => open("signIn")}>
          Sign in
        </button>
      </div>
    );
  }

  const status =
    sync === "error" ? (syncError ?? "Sync failed") : sync === "saving" ? "Syncing…" : "Everything is synced";

  return (
    <div className="account-panel">
      <div className="account-identity">
        <span className="account-avatar" aria-hidden="true">
          {(user.name || user.email).charAt(0).toUpperCase()}
        </span>
        <div>
          <strong>{user.name || user.email}</strong>
          <span>{user.email}</span>
        </div>
      </div>
      <dl className="account-panel__stats">
        <div>
          <dt>Favorites</dt>
          <dd>{favorites}</dd>
        </div>
        <div>
          <dt>Sets</dt>
          <dd>{sets}</dd>
        </div>
      </dl>
      <p className={`account-panel__sync${sync === "error" ? " account-panel__sync--error" : ""}`}>{status}</p>
      {!user.twoFactorEnabled && (
        <button className="account-panel__nudge" onClick={() => open("setupPassword")}>
          Protect your account with two-factor →
        </button>
      )}
      <button className="account-secondary" onClick={() => open("manage")}>
        Manage account
      </button>
      <button className="account-secondary" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}
