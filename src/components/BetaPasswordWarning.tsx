/** Beta caveat shown wherever someone might create an account. Said plainly, up front: there
 *  is no email yet, so a forgotten password can't be reset. */
export function BetaPasswordWarning() {
  return (
    <p className="account-beta">
      <strong>Beta:</strong> there's no password reset yet. If you forget your password, that account and its favorites
      can't be recovered — save it in a password manager.
    </p>
  );
}
