import { useEffect } from "react";
import { motion } from "framer-motion";
import { useSpecialsStore } from "../state/specialsStore";

const DURATION_MS = 2400;
const SPARKS = 10;

/** Padlock-opening celebration shown once, right after a successful Specials unlock:
 *  the lock springs in, the shackle pops open with a wobble, and rings + sparks radiate
 *  out while it glows and fades. */
export function SpecialsUnlockBurst() {
  const clear = useSpecialsStore((s) => s.clearJustUnlocked);

  useEffect(() => {
    const t = setTimeout(clear, DURATION_MS);
    return () => clearTimeout(t);
  }, [clear]);

  return (
    <motion.div
      className="specials-unlock-burst"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: DURATION_MS / 1000, times: [0, 0.08, 0.78, 1] }}
    >
      {/* Soft glow behind the lock */}
      <motion.span
        className="specials-unlock-burst__glow"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: [0.4, 1.35, 1.1], opacity: [0, 0.85, 0.45] }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />
      <motion.svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ scale: 0.4, rotate: -8 }}
        animate={{ scale: [0.4, 1.22, 0.96, 1.05, 1], rotate: [-8, 3, -2, 0, 0] }}
        transition={{ duration: 1.05, ease: "easeOut", times: [0, 0.35, 0.6, 0.8, 1] }}
      >
        <rect x="5" y="11" width="14" height="9" rx="2" />
        {/* Shackle swings open off the right post with a springy overshoot */}
        <motion.path
          d="M8 11V7a4 4 0 0 1 8 0"
          initial={{ rotate: 0 }}
          animate={{ rotate: [0, -52, -34, -44, -40] }}
          transition={{ delay: 0.45, duration: 0.85, ease: "easeOut", times: [0, 0.4, 0.65, 0.85, 1] }}
          style={{ transformOrigin: "16px 7px" }}
        />
        {/* Keyhole blinks awake once the shackle is open */}
        <motion.circle
          cx="12"
          cy="15"
          r="1.4"
          fill="currentColor"
          stroke="none"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 1], scale: [0, 1.5, 1] }}
          transition={{ delay: 0.75, duration: 0.5, ease: "backOut" }}
          style={{ transformOrigin: "12px 15px" }}
        />
      </motion.svg>
      {/* Two expanding rings, staggered */}
      <motion.span
        className="specials-unlock-burst__ring"
        initial={{ scale: 0.3, opacity: 0.7 }}
        animate={{ scale: 2.6, opacity: 0 }}
        transition={{ delay: 0.45, duration: 1.1, ease: "easeOut" }}
      />
      <motion.span
        className="specials-unlock-burst__ring"
        initial={{ scale: 0.3, opacity: 0.5 }}
        animate={{ scale: 3.4, opacity: 0 }}
        transition={{ delay: 0.75, duration: 1.3, ease: "easeOut" }}
      />
      {/* Sparks radiating outward */}
      {Array.from({ length: SPARKS }, (_, i) => {
        const angle = (i / SPARKS) * Math.PI * 2;
        const dist = 78 + (i % 3) * 22;
        return (
          <motion.span
            key={i}
            className="specials-unlock-burst__spark"
            initial={{ x: 0, y: 0, scale: 1, opacity: 0 }}
            animate={{
              x: Math.cos(angle) * dist,
              y: Math.sin(angle) * dist,
              scale: 0,
              opacity: [0, 1, 0],
            }}
            transition={{ delay: 0.5 + (i % 4) * 0.06, duration: 0.95, ease: "easeOut" }}
          />
        );
      })}
    </motion.div>
  );
}
