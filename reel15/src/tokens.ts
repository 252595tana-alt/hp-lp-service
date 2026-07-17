import { FONT_FAMILY, loadNotoSansJP } from "./fonts/loadNotoSansJP";

loadNotoSansJP();

export const FONT = FONT_FAMILY;

export const COLORS = {
  navy: "#0A1F44",
  navyDeep: "#071734",
  blue: "#1E5EFF",
  blueGlow: "rgba(30, 94, 255, 0.55)",
  white: "#FFFFFF",
  offWhite: "#F4F7FF",
};

export const FPS = 30;

// Shot boundaries in frames (30fps), retimed to the silence gaps detected
// in the narration track (public/audio/narration.mp3) so each cut lands on
// a natural pause in the voiceover instead of the original evenly-paced cuts.
export const SHOTS = {
  s1: { from: 0, dur: 34 }, // 0.00 - 1.13s
  s2: { from: 34, dur: 58 }, // 1.13 - 3.07s
  s3: { from: 92, dur: 119 }, // 3.07 - 7.07s
  s4: { from: 211, dur: 69 }, // 7.03 - 9.33s
  s5: { from: 280, dur: 113 }, // 9.33 - 13.10s
  s6: { from: 393, dur: 74 }, // 13.10 - 15.57s
  s7: { from: 467, dur: 33 }, // 15.57 - 16.67s
};

export const TOTAL_FRAMES = 500;
