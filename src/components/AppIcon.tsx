import { BRAND_ICONS, monogramColor } from "../lib/brandIcons";

interface AppIconProps {
  appId: string;
  name: string;
  className?: string;
}

export function AppIcon({ appId, name, className }: AppIconProps) {
  const brand = BRAND_ICONS[appId];

  if (brand) {
    return (
      <div className={`app-icon app-icon--brand ${className ?? ""}`}>
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
