import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogoMark } from "./LogoMark";

const THOREAU_QUOTES = [
  "Go confidently in the direction of your dreams. Live the life you have imagined.",
  "It's not what you look at that matters, it's what you see.",
  "Our life is frittered away by detail. Simplify, simplify.",
  "The world is but a canvas to our imagination.",
  "Never look back unless you are planning to go that way.",
  "What you get by achieving your goals is not as important as what you become by achieving your goals.",
  "Heaven is under our feet as well as over our heads.",
  "All good things are wild and free.",
  "This world is but a canvas to our imagination.",
  "Things do not change; we change.",
  "The price of anything is the amount of life you exchange for it.",
  "I went to the woods because I wished to live deliberately.",
  "If you have built castles in the air, your work need not be lost; that is where they should be. Now put the foundations under them.",
  "Live in each season as it passes; breathe the air, drink the drink, taste the fruit.",
];

const SPLASH_DURATION_MS = 1900;

/** Quick launch splash: the app logo draws itself in (ring sweeps, arrow drops), then the
 *  whole thing dissolves into the app. A random Thoreau quote keeps it company, Discord-style. */
export function LaunchSplash({ onDone }: { onDone: () => void }) {
  const [quote] = useState(() => THOREAU_QUOTES[Math.floor(Math.random() * THOREAU_QUOTES.length)]);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence onExitComplete={onDone}>
      {visible && (
        <motion.div
          className="launch-splash"
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.45, ease: "easeInOut" }}
        >
          <LogoMark className="launch-splash__orb" animated />
          <motion.p
            className="launch-splash__quote"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            “{quote}”
          </motion.p>
          <motion.span
            className="launch-splash__attribution"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
          >
            — Henry David Thoreau
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
