import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../tokens";

export const Shot6: React.FC = () => {
  const frame = useCurrentFrame();

  // Cross-dissolve in over first 8 frames (overlaps Shot 5 tail)
  const bgOp = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });

  // Text fade-up begins after the dissolve settles
  const textOp = interpolate(frame, [10, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const textY = interpolate(frame, [10, 24], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Letterspacing expands from compressed to final over 0.7s (21 frames)
  const tracking = interpolate(frame, [10, 31], [-0.04, 0.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.navy,
        opacity: bgOp,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          textAlign: "center",
          opacity: textOp,
          transform: `translateY(${textY}px)`,
          padding: "0 60px",
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 96,
            lineHeight: 1.5,
            color: COLORS.white,
            letterSpacing: `${tracking}em`,
          }}
        >
          ホームページは
          <br />
          <span style={{ color: COLORS.blue }}>24時間働く</span>営業マン。
        </div>
      </div>
    </AbsoluteFill>
  );
};
