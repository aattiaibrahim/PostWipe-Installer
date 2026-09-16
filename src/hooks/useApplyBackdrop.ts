import { useEffect } from "react";
import { Effect, getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "../lib/tauriCommands";
import { isMacOS } from "../lib/platform";
import { hydrateBackdropFromDisk, useBackdropStore } from "../state/backdropStore";

/** Applies the backdrop choice to both the page (`html[data-backdrop]`, which liquid-glass.css
 *  keys off) and the native window.
 *
 *  Windows needs one extra step. The window is transparent and undecorated so CSS can clip
 *  it to a 20px radius — but Acrylic is painted by DWM across the whole RECTANGULAR window,
 *  outside that clip, which would bring back square, blurred corners. Turning the native
 *  shadow on makes Windows 11 round the window itself (fixed at 8px), so native mode trades
 *  the larger radius for corners that actually hold. Wallpaper mode turns it back off. */
export function useApplyBackdrop() {
  const backdrop = useBackdropStore((s) => s.backdrop);

  useEffect(() => {
    void hydrateBackdropFromDisk();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.backdrop = backdrop;
    if (!isTauri) return;

    const win = getCurrentWindow();
    const native = backdrop === "native";
    const apply = async () => {
      if (native) {
        await win.setEffects({ effects: [isMacOS ? Effect.Sidebar : Effect.Acrylic] });
        if (!isMacOS) await win.setShadow(true);
      } else {
        await win.clearEffects();
        if (!isMacOS) await win.setShadow(false);
      }
    };
    // An unsupported effect (e.g. Acrylic on an old Windows build) just leaves the themed
    // tint showing, which still reads fine — never worth surfacing as an error.
    apply().catch(() => {});
  }, [backdrop]);
}
