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

// Shot boundaries in frames (30fps)
export const SHOTS = {
  s1: { from: 0, dur: 36 }, // 0.0 - 1.2s
  s2: { from: 36, dur: 54 }, // 1.2 - 3.0s
  s3: { from: 90, dur: 105 }, // 3.0 - 6.5s
  s4: { from: 195, dur: 90 }, // 6.5 - 9.5s
  s5: { from: 285, dur: 75 }, // 9.5 - 12.0s
  s6: { from: 360, dur: 60 }, // 12.0 - 14.0s
  s7: { from: 420, dur: 80 }, // 14.0 - 16.67s (held to cover narration)
};

export const TOTAL_FRAMES = 500;
