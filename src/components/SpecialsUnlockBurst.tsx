import { useEffect } from "react";
import { motion } from "framer-motion";
import { useSpecialsStore } from "../state/specialsStore";

/** Quick padlock-opening burst shown once, right after a successful Specials unlock. */
export function SpecialsUnlockBurst() {
  const clear = useSpecialsStore((s) => s.clearJustUnlocked);

  useEffect(() => {
    const t = setTimeout(clear, 1100);
    return () => clearTimeout(t);
  }, [clear]);

  return (
    <motion.div
      className="specials-unlock-burst"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.1, times: [0, 0.15, 0.7, 1] }}
    >
      <motion.svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ scale: 0.6 }}
        animate={{ scale: [0.6, 1.15, 1] }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <rect x="5" y="11" width="14" height="9" rx="2" />
        {/* Shackle swings open (rotates off the right post) */}
        <motion.path
          d="M8 11V7a4 4 0 0 1 8 0"
          initial={{ rotate: 0 }}
          animate={{ rotate: -32 }}
          transition={{ delay: 0.25, duration: 0.35, ease: "backOut" }}
          style={{ transformOrigin: "16px 7px" }}
        />
      </motion.svg>
      {/* Expanding ring */}
      <motion.span
        className="specials-unlock-burst__ring"
        initial={{ scale: 0.3, opacity: 0.6 }}
        animate={{ scale: 2.4, opacity: 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
    </motion.div>
  );
}
