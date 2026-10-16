import clickUrl from "../assets/sounds/ui-click.wav";
import { useSoundStore } from "../state/soundStore";

// The Ubuntu "Menu popup" click, decoded once and replayed via a fresh buffer source per
// click (so rapid clicks overlap cleanly and there's no restart latency).
let ctx: AudioContext | null = null;
let buffer: AudioBuffer | null = null;
let loading: Promise<void> | null = null;

function ensure(): Promise<void> {
  if (buffer) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    ctx ??= new AudioContext();
    const res = await fetch(clickUrl);
    buffer = await ctx.decodeAudioData(await res.arrayBuffer());
  })();
  return loading;
}

/** Play the UI click, unless the user turned sounds off. No-op on any audio failure. */
export function playClick(): void {
  if (!useSoundStore.getState().enabled) return;
  ensure()
    .then(() => {
      if (!ctx || !buffer) return;
      if (ctx.state === "suspended") void ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 0.35; // keep it subtle
      src.connect(gain).connect(ctx.destination);
      src.start();
    })
    .catch(() => {});
}
