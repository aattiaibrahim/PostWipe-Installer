import { BRAND_ICONS, monogramColor, relativeLuminance } from "../lib/brandIcons";

interface AppIconProps {
  appId: string;
  name: string;
  className?: string;
}

export function AppIcon({ appId, name, className }: AppIconProps) {
  const brand = BRAND_ICONS[appId];

  if (brand) {
    // Brand marks are single-color and often near-black or near-white per their
    // own guidelines (e.g. Steam is "000000") — pick a chip background with
    // guaranteed contrast against *that specific icon*, independent of the
    // app's own light/dark theme.
    const isDark = relativeLuminance(brand.hex) < 0.4;
    const chipBg = isDark ? "#f2f2f3" : "#1c1d21";
    return (
      <div className={`app-icon app-icon--brand ${className ?? ""}`} style={{ backgroundColor: chipBg }}>
        <svg viewBox="0 0 24 24" className="app-icon__svg" style={{ fill: `#${brand.hex}` }}>
          <path d={brand.path} />
        </svg>
      </div>
    );
  }

  return (
    <div className={`app-icon app-icon--monogram ${className ?? ""}`} style={{ backgroundColor: monogramColor(appId) }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
