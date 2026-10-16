import { create } from "zustand";
import { HOME_CATEGORY_ID } from "../lib/constants";
import { useCatalogStore } from "./catalogStore";
import { SPECIALS_CATEGORY_ID } from "./specialsStore";
import { useSpecialsNavStore } from "./specialsNavStore";

/** Back/forward history, as a browser keeps it - driven by mouse 4 and 5.
 *
 *  The app has no URLs, so there was no history for those buttons to walk. A "location" is
 *  the page you're on (`selectedCategoryId`: a category, Home, All Apps, Favorites,
 *  Downloads, a set, a See All jump) plus, on Specials, the folder you're in. Every change to
 *  either is recorded by subscribing to the stores that hold them, so nothing that navigates
 *  has to remember to call in here - the sidebar, See All, the Specials back bar and anything
 *  added later are all covered.
 *
 *  Pop-ups (detail sheets, lightboxes, dialogs, the Settings/Account dock) are not places.
 *  Back closes the open one instead of changing page, and Forward does nothing while one is
 *  open - see `navigateBack`. */

interface Location {
  categoryId: string;
  folder: string | null;
  path: string[];
}

interface NavHistoryState {
  back: Location[];
  forward: Location[];
}

/** Plenty to walk back through; bounded so a long session can't grow it forever. */
const MAX_ENTRIES = 50;

export const useNavHistoryStore = create<NavHistoryState>(() => ({ back: [], forward: [] }));

function snapshot(): Location {
  const categoryId = useCatalogStore.getState().selectedCategoryId ?? HOME_CATEGORY_ID;
  if (categoryId !== SPECIALS_CATEGORY_ID) return { categoryId, folder: null, path: [] };
  const { folder, path } = useSpecialsNavStore.getState();
  return { categoryId, folder, path };
}

function same(a: Location, b: Location): boolean {
  return a.categoryId === b.categoryId && a.folder === b.folder && a.path.join("/") === b.path.join("/");
}

/** True while history itself is moving you, so that move isn't recorded as a new visit. */
let applying = false;
let last = snapshot();

function recordChange() {
  if (applying) return;
  // Arriving on Specials from elsewhere starts at its landing grid, as it did when the folder
  // lived in the page's own state and reset every time the page mounted.
  if (useCatalogStore.getState().selectedCategoryId === SPECIALS_CATEGORY_ID && last.categoryId !== SPECIALS_CATEGORY_ID) {
    applying = true;
    useSpecialsNavStore.getState().setAt(null, []);
    applying = false;
  }
  const next = snapshot();
  if (same(next, last)) return;
  const back = [...useNavHistoryStore.getState().back, last].slice(-MAX_ENTRIES);
  // A new visit after going back drops the forward trail, as a browser does.
  useNavHistoryStore.setState({ back, forward: [] });
  last = next;
}

useCatalogStore.subscribe((s, prev) => {
  if (s.selectedCategoryId !== prev.selectedCategoryId) recordChange();
});
useSpecialsNavStore.subscribe(recordChange);

function go(to: Location) {
  applying = true;
  useCatalogStore.getState().setSelectedCategory(to.categoryId);
  useSpecialsNavStore.getState().setAt(to.folder, to.path);
  applying = false;
  last = snapshot();
}

export function goBack(): boolean {
  const { back, forward } = useNavHistoryStore.getState();
  const to = back[back.length - 1];
  if (!to) return false;
  useNavHistoryStore.setState({ back: back.slice(0, -1), forward: [...forward, last] });
  go(to);
  return true;
}

export function goForward(): boolean {
  const { back, forward } = useNavHistoryStore.getState();
  const to = forward[forward.length - 1];
  if (!to) return false;
  useNavHistoryStore.setState({ back: [...back, last].slice(-MAX_ENTRIES), forward: forward.slice(0, -1) });
  go(to);
  return true;
}

/** Everything that floats over the page. Most mark themselves `role="dialog"`; the lightbox
 *  family (image, sound and cursor previews), confirm prompts and the Specials detail sheet
 *  are matched by their wrappers. Add a class here if a new pop-up doesn't carry the role. */
const OVERLAY_SELECTOR = '[role="dialog"], [aria-modal="true"], .preview-lightbox, .confirm-overlay, .specials-detail';

/** Pop-ups Back has just closed. A closed pop-up stays in the DOM while it fades out, and
 *  without this a second quick press would be spent "closing" it again instead of going back
 *  a page. Forgotten after FADE_GRACE_MS: anything still there by then really is open (an
 *  Escape handler that declined to close, say), and Back should reach it again. */
const dismissed = new WeakSet<Element>();
const FADE_GRACE_MS = 600;

function openOverlays(): Element[] {
  return [...document.querySelectorAll(OVERLAY_SELECTOR)].filter((el) => {
    for (let n: Element | null = el; n; n = n.parentElement) if (dismissed.has(n)) return false;
    return true;
  });
}

function overlayOpen(): boolean {
  return openOverlays().length > 0 || useCatalogStore.getState().dockView !== null;
}

/** Mouse 4. Closes the top pop-up if one is open, otherwise goes back a page.
 *
 *  Closing is done by sending Escape: every pop-up in the app already closes on it, and the
 *  handlers already know about stacking (a confirm prompt over Settings closes first) - so
 *  Back gets the same behaviour without each pop-up having to learn about mouse buttons. */
export function navigateBack() {
  if (overlayOpen()) {
    // Portals mount at the end of <body>, so the last match is the one on top. Its overlay
    // ancestors (a sheet's backdrop) go with it.
    const top = openOverlays().pop();
    const closing: Element[] = [];
    for (let n: Element | null = top ?? null; n; n = n.parentElement) {
      if (n.matches(OVERLAY_SELECTOR)) closing.push(n);
    }
    closing.forEach((el) => dismissed.add(el));
    setTimeout(() => closing.forEach((el) => dismissed.delete(el)), FADE_GRACE_MS);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return;
  }
  goBack();
}

/** Mouse 5. Forward through pages you went back from; ignored while a pop-up is open, where
 *  jumping the page underneath it would be surprising. */
export function navigateForward() {
  if (overlayOpen()) return;
  goForward();
}
