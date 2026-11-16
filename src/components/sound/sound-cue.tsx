"use client";

import { useEffect } from "react";
import { playSound, unlockAudioOnFirstTouch, type SoundName } from "@/lib/sound";

/**
 * Plays a sound once when it first appears for a given key (for example a
 * finished redemption), not again on refresh or revisits in this tab.
 */
export function SoundCue({ sound, onceKey }: { sound: SoundName; onceKey: string }) {
  useEffect(() => {
    const key = `perqly-sound:${onceKey}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    playSound(sound);
  }, [sound, onceKey]);
  return null;
}

/** Unlocks audio on the first tap, once per app load. */
export function SoundUnlock() {
  useEffect(() => unlockAudioOnFirstTouch(), []);
  return null;
}
