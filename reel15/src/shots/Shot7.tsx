import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT } from "../tokens";

export const Shot7: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const textOp = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });

  const pop = (delay: number) => {
    const s = spring({
      frame: frame - delay,
      fps,
      config: { damping: 11, stiffness: 210, mass: 0.5 },
      durationInFrames: 12,
    });
    return frame < delay ? 0 : interpolate(s, [0, 1], [0.5, 1]);
  };

  // Breathing glow loop
  const breathe = 0.5 + 0.5 * Math.sin(frame / 5);

  return (
    <AbsoluteFill
      style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 360 }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 54,
            color: COLORS.white,
            opacity: textOp,
            letterSpacing: "0.14em",
          }}
        >
          無料相談受付中
        </div>
        <div
          style={{
            marginTop: 60,
            display: "flex",
            gap: 60,
            justifyContent: "center",
          }}
        >
          {/* Instagram-style icon */}
          <div
            style={{
              width: 140,
              height: 140,
              borderRadius: 38,
              backgroundColor: COLORS.white,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              transform: `scale(${pop(6)})`,
              boxShadow: `0 0 ${30 + breathe * 40}px rgba(30,94,255,${0.4 + breathe * 0.4})`,
            }}
          >
            <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
              <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke={COLORS.blue} strokeWidth="2.2" />
              <circle cx="12" cy="12" r="4.2" stroke={COLORS.blue} strokeWidth="2.2" />
              <circle cx="17.2" cy="6.8" r="1.3" fill={COLORS.blue} />
            </svg>
          </div>
          {/* DM paper-plane icon */}
          <div
            style={{
              width: 140,
              height: 140,
              borderRadius: 38,
              backgroundColor: COLORS.blue,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              transform: `scale(${pop(11)})`,
              boxShadow: `0 0 ${30 + breathe * 40}px rgba(30,94,255,${0.4 + breathe * 0.4})`,
            }}
          >
            <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
              <path
                d="M21 3 L3 10.5 L10 13.5 L13 20.5 L21 3 Z M10 13.5 L21 3"
                stroke={COLORS.white}
                strokeWidth="2.2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
