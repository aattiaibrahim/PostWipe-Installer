import { create } from "zustand";
import { getSavedBackdrop, isTauri, saveBackdrop, type Backdrop } from "../lib/tauriCommands";

interface BackdropState {
  backdrop: Backdrop;
  setBackdrop: (backdrop: Backdrop) => void;
}

/** What the Liquid Glass chrome floats over. "wallpaper" is the default: a gradient built
 *  from the active theme, so the glass always has colour to refract and looks the same on
 *  every machine. "native" hands the backdrop to the OS (Acrylic / vibrancy) so the window
 *  blurs the real desktop behind it. */
export const useBackdropStore = create<BackdropState>((set) => ({
  backdrop: "wallpaper",
  setBackdrop: (backdrop) => {
    set({ backdrop });
    void saveBackdrop(backdrop);
  },
}));

/** Native see-through needs a real window, so it's never offered in the browser preview. */
export const nativeBackdropSupported = isTauri;

export async function hydrateBackdropFromDisk(): Promise<void> {
  const saved = await getSavedBackdrop();
  if (saved && saved !== useBackdropStore.getState().backdrop) {
    useBackdropStore.setState({ backdrop: saved });
  }
}
