import { motion } from "framer-motion";

/** The PostWipe mark: a graphite tile holding a download arrow inside a three-quarter progress
 *  ring — the same ring an app's "Get" button turns into. Mirrors src-tauri/icons (generated
 *  from this drawing with `npx tauri icon`).
 *
 *  `animated` draws it in for the launch splash: the tile settles, the ring sweeps round to
 *  three quarters, and the arrow drops into place. */
export function LogoMark({ className, animated = false }: { className?: string; animated?: boolean }) {
  const id = animated ? "logo-anim" : "logo";
  return (
    <svg className={className} viewBox="0 0 1024 1024" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3a3e" />
          <stop offset="1" stopColor="#161618" />
        </linearGradient>
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#64d2ff" />
          <stop offset="1" stopColor="#0a84ff" />
        </linearGradient>
      </defs>
      <motion.g
        initial={animated ? { scale: 0.86, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: "512px 512px" }}
      >
        <rect x="64" y="64" width="896" height="896" rx="200" fill={`url(#${id}-bg)`} />
        <rect
          x="64.5"
          y="64.5"
          width="895"
          height="895"
          rx="199.5"
          fill="none"
          stroke="#fff"
          strokeOpacity="0.12"
          strokeWidth="3"
        />
      </motion.g>
      <circle cx="512" cy="512" r="250" fill="none" stroke="#fff" strokeOpacity="0.12" strokeWidth="44" />
      <motion.circle
        cx="512"
        cy="512"
        r="250"
        fill="none"
        stroke={`url(#${id}-ring)`}
        strokeWidth="44"
        strokeLinecap="round"
        initial={animated ? { pathLength: 0 } : false}
        animate={{ pathLength: 0.75 }}
        transition={{ delay: 0.25, duration: 0.8, ease: "easeInOut" }}
        style={{ rotate: -90, transformOrigin: "512px 512px" }}
      />
      <motion.path
        d="M512 380v240M420 540l92 92 92-92"
        fill="none"
        stroke="#f5f5f7"
        strokeWidth="58"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animated ? { y: -70, opacity: 0 } : false}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.75, type: "spring", stiffness: 420, damping: 22 }}
      />
    </svg>
  );
}
