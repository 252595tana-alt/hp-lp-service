import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT } from "../tokens";

export const Shot1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Scale-in punch: 130% -> 100%, landing at ~frame 6
  const punch = spring({
    frame,
    fps,
    config: { damping: 200, stiffness: 400, mass: 0.6 },
    durationInFrames: 8,
  });
  const scale = interpolate(punch, [0, 1], [1.3, 1]);
  const opacity = interpolate(frame, [0, 3], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Single-frame white flash on landing (frames 6-7)
  const flash = interpolate(frame, [5, 6, 8], [0, 0.85, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // 2-frame micro-shake right after impact
  const shakeAmp = frame >= 6 && frame <= 9 ? (9 - frame) * 3 : 0;
  const shakeX = shakeAmp * Math.sin(frame * 37.7);
  const shakeY = shakeAmp * Math.cos(frame * 29.3);

  // Underline draws left-to-right in 0.3s (9 frames), starting frame 10
  const underline = interpolate(frame, [10, 19], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.navy,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          transform: `translate(${shakeX}px, ${shakeY}px) scale(${scale})`,
          opacity,
          textAlign: "center",
          padding: "0 80px",
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 92,
            lineHeight: 1.45,
            color: COLORS.white,
            letterSpacing: "0.02em",
          }}
        >
          ホームページは
          <br />
          名刺ではありません。
        </div>
        <div
          style={{
            marginTop: 44,
            height: 8,
            width: 620,
            marginLeft: "auto",
            marginRight: "auto",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: "100%",
              backgroundColor: COLORS.blue,
              transform: `scaleX(${underline})`,
              transformOrigin: "left center",
              borderRadius: 4,
            }}
          />
        </div>
      </div>
      {/* Impact flash overlay */}
      <AbsoluteFill
        style={{ backgroundColor: COLORS.white, opacity: flash, pointerEvents: "none" }}
      />
    </AbsoluteFill>
  );
};
