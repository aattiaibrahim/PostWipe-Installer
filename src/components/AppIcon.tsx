import { useState } from "react";
import { BRAND_ICONS, monogramColor, relativeLuminance } from "../lib/brandIcons";
import nanazipIcon from "../assets/app-icons/nanazip.png";
import testmem5Icon from "../assets/app-icons/testmem5.png";
import zentimingsIcon from "../assets/app-icons/zentimings.png";
import timerResolutionIcon from "../assets/app-icons/timer-resolution.png";
import puttyIcon from "../assets/app-icons/putty.ico";
import qobuzIcon from "../assets/app-icons/qobuz.png";
import musicPresenceIcon from "../assets/app-icons/music-presence.png";
import deceiveIcon from "../assets/app-icons/deceive.ico";
import losslesscutIcon from "../assets/app-icons/losslesscut.png";
import translucenttbIcon from "../assets/app-icons/translucenttb.png";
import screentogifIcon from "../assets/app-icons/screentogif.png";
import obsIcon from "../assets/app-icons/obs.png";
import dockerIcon from "../assets/app-icons/docker.png";
import claudeIcon from "../assets/app-icons/claude.png";
import codexIcon from "../assets/app-icons/codex.png";
import flaresolverrIcon from "../assets/app-icons/flaresolverr.png";
import houdokuIcon from "../assets/app-icons/houdoku.png";
import vencordIcon from "../assets/app-icons/vencord.png";
import streamDeckIcon from "../assets/app-icons/stream-deck.png";
import insta360Icon from "../assets/app-icons/insta360.png";
import batIcon from "../assets/app-icons/bat.ico";

/** Real app logos bundled for apps whose GitHub favicon would otherwise show (their repo
 *  icon / the icon embedded in their own executable — extracted offline). */
const BUNDLED_ICONS: Record<string, string> = {
  nanazip: nanazipIcon,
  testmem5: testmem5Icon,
  zentimings: zentimingsIcon,
  "timer-resolution": timerResolutionIcon,
  putty: puttyIcon,
  // qobuz.com's own favicon/touch-icon ships opaque white corners — this copy has them
  // flood-filled to transparent. music-presence's domain is github.com, which used to
  // render the GitHub favicon; this is their real mark (white, needs the dark chip below).
  qobuz: qobuzIcon,
  "music-presence": musicPresenceIcon,
  // GitHub-hosted apps whose domain would otherwise render the GitHub favicon.
  deceive: deceiveIcon,
  losslesscut: losslesscutIcon,
  translucenttb: translucenttbIcon,
  screentogif: screentogifIcon,
  "obs-studio": obsIcon,
  "docker-desktop": dockerIcon,
  "claude-desktop": claudeIcon,
  codex: codexIcon,
  flaresolverr: flaresolverrIcon,
  houdoku: houdokuIcon,
  vencord: vencordIcon,
  "elgato-stream-deck": streamDeckIcon,
  // insta360.com's favicon IS their real mark — bundled so it renders without a network hop.
  "insta360-link-controller": insta360Icon,
  // Script entries have no domain — they'd fall through to a monogram letter.
  "restart-audio-service": batIcon,
  "kill-valorant-process": batIcon,
};

/** Bundled marks that are near-white get a fixed dark chip (theme-independent), mirroring
 *  the luminance-picked chip the single-color brand icons use. */
const BUNDLED_CHIP_BG: Record<string, string> = {
  "music-presence": "#1c1d21",
  // Near-black marks on a transparent field (Vencord's "V", Elgato's Stream Deck line-art
  // glyph, Insta360's black tile) would disappear against the dark themes' surface.
  vencord: "#f2f2f3",
  "elgato-stream-deck": "#f2f2f3",
  "insta360-link-controller": "#f2f2f3",
};

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

  const bundled = BUNDLED_ICONS[appId];
  if (bundled) {
    const chipBg = BUNDLED_CHIP_BG[appId];
    return (
      <div
        className={`app-icon app-icon--favicon ${className ?? ""}`}
        style={chipBg ? { backgroundColor: chipBg } : undefined}
      >
        <img className="app-icon__favicon-img" src={bundled} alt="" loading="lazy" />
      </div>
    );
  }

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
