import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT } from "../tokens";

const NODES = ["SNS", "ホームページ", "信頼", "問い合わせ", "売上"];
const BEAT = 19; // ~0.63s per node, scaled to the shot's retimed duration
const NODE_H = 170;
const GAP = 96; // space for arrow between nodes

export const Shot3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Settle to 95% once all nodes landed
  const settleStart = BEAT * 5 + 6;
  const settle = interpolate(frame, [settleStart, settleStart + 10], [1, 0.95], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Horizontal push exit (last 7 frames)
  const exitP = interpolate(
    frame,
    [durationInFrames - 7, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const exitX = -exitP * 1300;

  // Glow ring on 売上
  const ringStart = BEAT * 4 + 8;
  const ringP = interpolate(frame, [ringStart, ringStart + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ringScale = interpolate(ringP, [0, 1], [0.6, 2.4]);
  const ringOp = interpolate(ringP, [0, 0.15, 1], [0, 0.9, 0]);

  const totalH = NODES.length * NODE_H + (NODES.length - 1) * GAP;
  const topStart = (1920 - totalH) / 2;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.offWhite,
        transform: `translateX(${exitX}px)`,
        filter: exitP > 0 ? `blur(${exitP * 24}px)` : undefined,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${settle})`,
        }}
      >
        {NODES.map((label, i) => {
          const delay = i * BEAT;
          const pop = spring({
            frame: frame - delay,
            fps,
            config: { damping: 11, stiffness: 190, mass: 0.5 },
            durationInFrames: 14,
          });
          const nodeScale = frame < delay ? 0 : interpolate(pop, [0, 1], [0.4, 1]);
          const nodeOp = frame < delay ? 0 : 1;

          // Arrow draws in the gap after this node (before next)
          const arrowDelay = delay + 9;
          const arrowP = interpolate(frame, [arrowDelay, arrowDelay + 7], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const y = topStart + i * (NODE_H + GAP);
          const isLast = i === NODES.length - 1;

          return (
            <div key={label}>
              {/* Node */}
              <div
                style={{
                  position: "absolute",
                  top: y,
                  left: "50%",
                  width: 640,
                  height: NODE_H,
                  marginLeft: -320,
                  borderRadius: 28,
                  backgroundColor: isLast ? COLORS.blue : COLORS.white,
                  boxShadow: "0 14px 34px rgba(10, 31, 68, 0.14)",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  transform: `scale(${nodeScale})`,
                  opacity: nodeOp,
                  fontFamily: FONT,
                  fontWeight: 900,
                  fontSize: 66,
                  color: isLast ? COLORS.white : COLORS.navy,
                  letterSpacing: "0.04em",
                }}
              >
                {label}
                {/* Glow ring payoff on 売上 */}
                {isLast && (
                  <div
                    style={{
                      position: "absolute",
                      inset: -12,
                      borderRadius: 40,
                      border: `6px solid ${COLORS.blue}`,
                      transform: `scale(${ringScale})`,
                      opacity: ringOp,
                    }}
                  />
                )}
              </div>
              {/* Connector arrow */}
              {!isLast && (
                <svg
                  width="60"
                  height={GAP}
                  viewBox={`0 0 60 ${GAP}`}
                  style={{
                    position: "absolute",
                    top: y + NODE_H,
                    left: "50%",
                    marginLeft: -30,
                  }}
                >
                  <line
                    x1="30"
                    y1="8"
                    x2="30"
                    y2={8 + (GAP - 34) * arrowP}
                    stroke={COLORS.blue}
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                  {arrowP > 0.85 && (
                    <path
                      d={`M14 ${GAP - 30} L30 ${GAP - 10} L46 ${GAP - 30}`}
                      stroke={COLORS.blue}
                      strokeWidth="8"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </svg>
              )}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
