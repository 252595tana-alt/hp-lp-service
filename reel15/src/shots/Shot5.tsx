import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT } from "../tokens";

const FEATURES = ["24時間営業", "SEO", "お問い合わせ", "更新可能"];

const FeatureIcon: React.FC<{ index: number }> = ({ index }) => {
  const stroke = COLORS.blue;
  const sw = 2.4;
  switch (index) {
    case 0: // clock
      return (
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8.5" stroke={stroke} strokeWidth={sw} />
          <path d="M12 7 v5 l3.5 2" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );
    case 1: // rising bars (SEO)
      return (
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
          <path d="M4 20 v-5 M10 20 v-9 M16 20 v-13" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          <path d="M4 9 l6-3 6-3 M13 3 h3 v3" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 2: // mail
      return (
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="5.5" width="18" height="13" rx="2" stroke={stroke} strokeWidth={sw} />
          <path d="M4 7 l8 6 8-6" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default: // refresh
      return (
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
          <path
            d="M19 12 a7 7 0 1 1 -2.2 -5.1 M17.5 3.5 v3.6 h-3.6"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
};

export const Shot5: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Bloom flash entry: fades out over first 8 frames
  const bloomOp = interpolate(frame, [0, 8], [0.96, 0], {
    extrapolateRight: "clamp",
  });

  // Gentle pull-back in the final 15 frames (0.5s)
  const pull = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0.92],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const darken = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [0, 0.5],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Panels fly in from edges
  const flyIn = (delay: number, fromX: number, fromY: number) => {
    const s = spring({
      frame: frame - delay,
      fps,
      config: { damping: 14, stiffness: 170, mass: 0.6 },
      durationInFrames: 16,
    });
    const p = frame < delay ? 0 : s;
    return {
      transform: `translate(${(1 - p) * fromX}px, ${(1 - p) * fromY}px)`,
      opacity: frame < delay ? 0 : 1,
    };
  };

  // Line graph draws itself upward
  const graphP = interpolate(frame, [20, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const dash = 900;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.navy,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div style={{ transform: `scale(${pull})` }}>
        {/* Dashboard frame */}
        <div
          style={{
            width: 920,
            height: 1360,
            borderRadius: 44,
            backgroundColor: COLORS.white,
            boxShadow: `0 0 90px ${COLORS.blueGlow}`,
            padding: 44,
            ...flyIn(2, 0, -500),
          }}
        >
          {/* Header bar */}
          <div
            style={{
              height: 84,
              borderRadius: 22,
              backgroundColor: COLORS.navy,
              display: "flex",
              alignItems: "center",
              paddingLeft: 30,
              gap: 12,
              ...flyIn(6, -700, 0),
            }}
          >
            <div style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.blue }} />
            <div style={{ width: 220, height: 16, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.35)" }} />
          </div>

          {/* Graph panel */}
          <div
            style={{
              marginTop: 30,
              height: 420,
              borderRadius: 26,
              border: "3px solid #E2E9F8",
              padding: 24,
              ...flyIn(10, 700, 0),
            }}
          >
            <svg width="780" height="360" viewBox="0 0 780 360">
              {[0, 1, 2, 3].map((g) => (
                <line
                  key={g}
                  x1="0"
                  y1={70 + g * 80}
                  x2="780"
                  y2={70 + g * 80}
                  stroke="#EDF1FA"
                  strokeWidth="3"
                />
              ))}
              <path
                d="M20 320 L150 270 L280 290 L410 200 L540 160 L670 80 L760 40"
                stroke={COLORS.blue}
                strokeWidth="10"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={dash}
                strokeDashoffset={dash * (1 - graphP)}
              />
            </svg>
          </div>

          {/* Feature rows */}
          {FEATURES.map((f, i) => {
            const delay = 24 + i * 12; // scaled to the shot's retimed (longer) duration
            const s = spring({
              frame: frame - delay,
              fps,
              config: { damping: 12, stiffness: 200, mass: 0.5 },
              durationInFrames: 12,
            });
            const scale = frame < delay ? 0 : interpolate(s, [0, 1], [0.6, 1]);
            // Glow pulse on arrival
            const pulse = interpolate(
              frame,
              [delay + 4, delay + 10, delay + 20],
              [0, 1, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );
            return (
              <div
                key={f}
                style={{
                  marginTop: 24,
                  height: 128,
                  borderRadius: 24,
                  backgroundColor: COLORS.offWhite,
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 34,
                  gap: 30,
                  transform: `scale(${scale})`,
                  opacity: frame < delay ? 0 : 1,
                  boxShadow: `0 0 ${pulse * 40}px rgba(30,94,255,${pulse * 0.8})`,
                }}
              >
                <div
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: 22,
                    backgroundColor: COLORS.white,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    border: "2px solid #E2E9F8",
                  }}
                >
                  <FeatureIcon index={i} />
                </div>
                <div
                  style={{
                    fontFamily: FONT,
                    fontWeight: 900,
                    fontSize: 52,
                    color: COLORS.navy,
                    letterSpacing: "0.03em",
                  }}
                >
                  {f}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Darken toward closing */}
      <AbsoluteFill style={{ backgroundColor: COLORS.navy, opacity: darken, pointerEvents: "none" }} />
      {/* Bloom entry overlay */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 50%, ${COLORS.white} 0%, #DCE8FF 60%, ${COLORS.blue} 130%)`,
          opacity: bloomOp,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
