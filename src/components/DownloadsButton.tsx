import { useDownloadQueueStore } from "../state/downloadQueueStore";
import { useCatalogStore } from "../state/catalogStore";
import { DOWNLOADS_CATEGORY_ID } from "../lib/constants";
import { ACTIVE_STATUSES } from "./DownloadsPage";

/** Toolbar shortcut to the Downloads page. Shows a green counter only while something is
 *  downloading — the finished-file count lives on the sidebar row, not squeezed onto a 36px button. */
export function DownloadsButton() {
  const activeCount = useDownloadQueueStore((s) => Object.values(s.jobs).filter((j) => ACTIVE_STATUSES.has(j.status)).length);
  const selected = useCatalogStore((s) => s.selectedCategoryId === DOWNLOADS_CATEGORY_ID);
  const setSelectedCategory = useCatalogStore((s) => s.setSelectedCategory);

  return (
    <div className="download-history">
      <button
        className={`download-history__toggle download-history__toggle--icon${selected ? " download-history__toggle--on" : ""}`}
        onClick={() => setSelectedCategory(DOWNLOADS_CATEGORY_ID)}
        aria-label="Downloads"
        title="Downloads"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12" />
          <path d="M7 11l5 5 5-5" />
          <path d="M5 20h14" />
        </svg>
        {activeCount > 0 && (
          <span className="download-history__count download-history__count--active">{activeCount}</span>
        )}
      </button>
    </div>
  );
}
