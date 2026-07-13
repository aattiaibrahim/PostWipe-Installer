/** A green ring that chases around a download arrow — the "downloading" indicator in the
 *  Downloaded panel. Purely decorative (aria-hidden); the % and cancel button carry meaning. */
export function DownloadSpinner() {
  return (
    <span className="dl-spinner" aria-hidden="true">
      <svg className="dl-spinner__ring" viewBox="0 0 36 36">
        <circle className="dl-spinner__track" cx="18" cy="18" r="15" fill="none" />
        <circle className="dl-spinner__arc" cx="18" cy="18" r="15" fill="none" />
      </svg>
      <svg className="dl-spinner__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v11" />
        <path d="M7 10l5 5 5-5" />
        <path d="M5 20h14" />
      </svg>
    </span>
  );
}
