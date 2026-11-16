"use client";

/**
 * Short interface sounds, synthesised with Web Audio (no audio files).
 * Phones only allow sound after the person has touched the page, so the
 * audio context is unlocked on the first tap. Off when the person turns
 * Sounds off in Account → Appearance.
 */
export type SoundName = "notify" | "message" | "success" | "scan" | "error";

export const SOUND_STORAGE_KEY = "perqly-sounds";

// [frequency Hz, start s, length s] per note.
const TUNES: Record<SoundName, [number, number, number][]> = {
  notify: [
    [880, 0, 0.12],
    [1175, 0.11, 0.18],
  ],
  message: [
    [988, 0, 0.09],
    [1319, 0.08, 0.14],
  ],
  success: [
    [784, 0, 0.12],
    [988, 0.1, 0.12],
    [1319, 0.2, 0.3],
  ],
  scan: [[1568, 0, 0.08]],
  error: [
    [440, 0, 0.14],
    [330, 0.13, 0.22],
  ],
};

const VIBRATE: Partial<Record<SoundName, number | number[]>> = {
  notify: 60,
  message: 40,
  success: [40, 60, 80],
  scan: 30,
  error: [80, 50, 80],
};

let ctx: AudioContext | null = null;

function context() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

export function soundsEnabled() {
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundsEnabled(on: boolean) {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, on ? "on" : "off");
  } catch {}
}

/** Call once on app start: unlocks audio on the first touch, as phones require. */
export function unlockAudioOnFirstTouch() {
  if (typeof window === "undefined") return;
  const unlock = () => {
    const c = context();
    if (c && c.state === "suspended") void c.resume();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

export function playSound(name: SoundName, { vibrate = true }: { vibrate?: boolean } = {}) {
  if (!soundsEnabled()) return;
  try {
    if (vibrate && VIBRATE[name]) navigator.vibrate?.(VIBRATE[name]!);
  } catch {}
  const c = context();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  const now = c.currentTime + 0.01;
  const out = c.createGain();
  out.gain.value = 0.18;
  out.connect(c.destination);
  for (const [freq, start, length] of TUNES[name]) {
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, now + start);
    env.gain.linearRampToValueAtTime(1, now + start + 0.012);
    env.gain.exponentialRampToValueAtTime(0.001, now + start + length);
    osc.connect(env).connect(out);
    osc.start(now + start);
    osc.stop(now + start + length + 0.02);
  }
}
