import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT } from "../tokens";

const CARDS = [
  { num: "①", title: "集客", sub: "検索・SNS・広告" },
  { num: "②", title: "信頼構築", sub: "会社概要・実績" },
  { num: "③", title: "行動", sub: "問い合わせ・購入" },
];

const STAGGER = 10; // 0.35s ≈ 10-11 frames

export const Shot4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Bloom flash exit: last 10 frames
  const bloomP = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.navy }}>
      {CARDS.map((c, i) => {
        const delay = i * STAGGER;
        const s = spring({
          frame: frame - delay,
          fps,
          config: { damping: 13, stiffness: 130, mass: 0.7 },
          durationInFrames: 20,
        });
        const x = frame < delay ? -1200 : interpolate(s, [0, 1], [-1200, 0]);
        // Shadow deepens as the card lands
        const shadow = interpolate(s, [0.6, 1], [10, 34], {
          extrapolateLeft: "clamp",
        });
        // Number circle rotate-settle
        const rot = interpolate(s, [0, 1], [-120, 0]);
        // Micro-loop inside card (one quick pulse after landing)
        const loopStart = delay + 22;
        const loop = interpolate(
          frame,
          [loopStart, loopStart + 8, loopStart + 16],
          [0, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );

        return (
          <div
            key={c.title}
            style={{
              position: "absolute",
              top: 380 + i * 400,
              left: 90,
              width: 900,
              height: 320,
              borderRadius: 36,
              backgroundColor: COLORS.white,
              boxShadow: `0 ${shadow}px ${shadow * 2}px rgba(0,0,0,0.35)`,
              transform: `translateX(${x}px)`,
              display: "flex",
              alignItems: "center",
              padding: "0 60px",
              gap: 50,
            }}
          >
            <div
              style={{
                width: 130,
                height: 130,
                borderRadius: "50%",
                backgroundColor: COLORS.blue,
                color: COLORS.white,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                fontFamily: FONT,
                fontWeight: 900,
                fontSize: 64,
                transform: `rotate(${rot}deg) scale(${1 + loop * 0.08})`,
                flexShrink: 0,
              }}
            >
              {c.num}
            </div>
            <div>
              <div
                style={{
                  fontFamily: FONT,
                  fontWeight: 900,
                  fontSize: 78,
                  color: COLORS.navy,
                  letterSpacing: "0.04em",
                }}
              >
                {c.title}
              </div>
              <div
                style={{
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: 40,
                  color: COLORS.blue,
                  marginTop: 8,
                  transform: `translateX(${loop * 10}px)`,
                }}
              >
                {c.sub}
              </div>
            </div>
          </div>
        );
      })}

      {/* Blue-white bloom flash exit with faint card outlines showing through */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 50%, ${COLORS.white} 0%, #DCE8FF 60%, ${COLORS.blue} 130%)`,
          opacity: bloomP * 0.96,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
