import { useState } from "react";
import { BRAND_ICONS, monogramColor, relativeLuminance } from "../lib/brandIcons";

interface AppIconProps {
  appId: string;
  name: string;
  domain?: string;
  className?: string;
}

export function AppIcon({ appId, name, domain, className }: AppIconProps) {
  // Favicons vary in quality but the user prefers a real (even low-res) favicon over a
  // generic monogram letter. Only network/load failures flip this — Google's favicon
  // endpoint returns a globe placeholder rather than erroring for domains with no icon.
  const [faviconFailed, setFaviconFailed] = useState(false);

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

  if (domain && !faviconFailed) {
    return (
      <div className={`app-icon app-icon--favicon ${className ?? ""}`}>
        <img
          className="app-icon__favicon-img"
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
          alt=""
          loading="lazy"
          onError={() => setFaviconFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={`app-icon app-icon--monogram ${className ?? ""}`} style={{ backgroundColor: monogramColor(appId) }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
