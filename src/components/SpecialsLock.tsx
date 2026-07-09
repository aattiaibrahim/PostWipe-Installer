import { useState } from "react";
import { motion } from "framer-motion";
import { useSpecialsStore } from "../state/specialsStore";

/** Password curtain for the Specials category: a breathing "void" glyph over an input. */
export function SpecialsLock() {
  const tryUnlock = useSpecialsStore((s) => s.tryUnlock);
  const [value, setValue] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [checking, setChecking] = useState(false);

  async function submit() {
    if (checking || !value) return;
    setChecking(true);
    const ok = await tryUnlock(value);
    setChecking(false);
    if (!ok) {
      setValue("");
      setShakeKey((k) => k + 1);
    }
  }

  return (
    <div className="specials-lock">
      <motion.svg
        className="specials-lock__glyph"
        viewBox="0 0 96 96"
        fill="none"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 22 }}
      >
        {/* Outer dashed ring, slowly rotating */}
        <motion.circle
          cx="48"
          cy="48"
          r="40"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 10"
          strokeLinecap="round"
          animate={{ rotate: 360 }}
          transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "48px 48px" }}
        />
        {/* Inner ring, counter-rotating */}
        <motion.circle
          cx="48"
          cy="48"
          r="28"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 6"
          strokeLinecap="round"
          animate={{ rotate: -360 }}
          transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "48px 48px" }}
        />
        {/* The void: a breathing core */}
        <motion.circle
          cx="48"
          cy="48"
          r="12"
          fill="currentColor"
          animate={{ scale: [1, 1.18, 1], opacity: [0.9, 0.6, 0.9] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "48px 48px" }}
        />
      </motion.svg>
      <h2 className="specials-lock__title">Specials</h2>
      <p className="specials-lock__hint">This vault is password-protected.</p>
      <motion.div
        key={shakeKey}
        className="specials-lock__form"
        animate={shakeKey > 0 ? { x: [0, -10, 10, -7, 7, -3, 3, 0] } : undefined}
        transition={{ duration: 0.45 }}
      >
        <input
          className="specials-lock__input"
          type="password"
          placeholder="Password"
          value={value}
          autoFocus
          disabled={checking}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <button className="specials-lock__submit" onClick={submit} disabled={checking}>
          {checking ? "Checking…" : "Enter"}
        </button>
      </motion.div>
    </div>
  );
}
