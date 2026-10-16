/** What the Liquid Glass chrome floats over. Glass reads only against colour, and a flat
 *  navy ground made the old translucent panels look like plain grey boxes — so this paints a
 *  wallpaper composed from the active theme's own palette (see liquid-glass.css).
 *
 *  It's deliberately STATIC. The ambient blobs it replaces animated every frame with
 *  `filter: blur()`, which kept a full-window composited layer busy forever and was one of
 *  the layers that broke the rounded window corners. In native mode the same element becomes
 *  a thin theme tint over the OS's desktop blur. */
export function GlassBackdrop() {
  return <div className="glass-backdrop" aria-hidden="true" />;
}
