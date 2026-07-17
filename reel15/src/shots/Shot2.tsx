import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT } from "../tokens";

const popIn = (frame: number, fps: number, delay: number) => {
  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 200, mass: 0.5 },
    durationInFrames: 14,
  });
  return {
    scale: interpolate(s, [0, 1], [0, 1]),
    opacity: frame < delay ? 0 : 1,
  };
};

const IconBadge: React.FC<{
  children: React.ReactNode;
  x: number;
  y: number;
  scale: number;
  opacity: number;
}> = ({ children, x, y, scale, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: 150,
      height: 150,
      borderRadius: 40,
      backgroundColor: COLORS.white,
      boxShadow: "0 18px 40px rgba(7, 23, 52, 0.35)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      transform: `scale(${scale})`,
      opacity,
    }}
  >
    {children}
  </div>
);

export const Shot2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Parallax slide-in from right
  const enter = spring({
    frame,
    fps,
    config: { damping: 100, stiffness: 120 },
    durationInFrames: 18,
  });
  const fgX = interpolate(enter, [0, 1], [500, 0]);
  const bgX = interpolate(enter, [0, 1], [220, 0]);

  // Text fade
  const textOp = interpolate(frame, [8, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Icons pop 0.3s (9 frames) apart, starting frame 20
  const icon1 = popIn(frame, fps, 20);
  const icon2 = popIn(frame, fps, 29);
  const icon3 = popIn(frame, fps, 38);

  // Phone screen glow pulse
  const glow = 0.5 + 0.3 * Math.sin(frame / 4);

  // Whip pan exit: last 6 frames, slide down with blur
  const exitStart = durationInFrames - 6;
  const exitP = interpolate(frame, [exitStart, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitY = exitP * 1900;
  const exitBlur = exitP * 40;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.navy,
        transform: `translateY(${exitY}px)`,
        filter: exitP > 0 ? `blur(${exitBlur}px)` : undefined,
      }}
    >
      {/* Background parallax circles */}
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${bgX}px)` }}>
        <div
          style={{
            position: "absolute",
            width: 700,
            height: 700,
            borderRadius: "50%",
            border: `3px solid rgba(30,94,255,0.25)`,
            left: 260,
            top: 560,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 460,
            height: 460,
            borderRadius: "50%",
            border: `2px solid rgba(255,255,255,0.08)`,
            left: 120,
            top: 420,
          }}
        />
      </div>

      {/* Foreground: person + phone */}
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${fgX}px)` }}>
        {/* Simple vector person */}
        <svg
          width="520"
          height="820"
          viewBox="0 0 260 410"
          style={{ position: "absolute", left: 280, top: 620 }}
        >
          {/* head */}
          <circle cx="130" cy="60" r="46" fill={COLORS.offWhite} />
          {/* hair */}
          <path d="M84 52 a46 46 0 0 1 92 0 l-8 -22 a46 30 0 0 0 -76 0 z" fill={COLORS.navyDeep} />
          {/* body */}
          <path
            d="M60 150 q70 -45 140 0 l14 180 q-84 30 -168 0 z"
            fill={COLORS.blue}
          />
          {/* arm holding phone */}
          <path d="M180 180 q50 20 34 78 l-40 14 q-14 -50 6 -92 z" fill={COLORS.blue} stroke={COLORS.navy} strokeWidth="3" />
        </svg>

        {/* Phone with glowing screen */}
        <div
          style={{
            position: "absolute",
            left: 610,
            top: 820,
            width: 190,
            height: 340,
            borderRadius: 32,
            backgroundColor: COLORS.navyDeep,
            padding: 12,
            boxShadow: `0 0 ${60 * glow}px rgba(30,94,255,${glow})`,
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 22,
              backgroundColor: COLORS.white,
              padding: 14,
            }}
          >
            {/* search bar with blinking cursor */}
            <div
              style={{
                marginTop: 26,
                height: 40,
                borderRadius: 20,
                border: `3px solid ${COLORS.blue}`,
                display: "flex",
                alignItems: "center",
                paddingLeft: 12,
              }}
            >
              <div
                style={{
                  width: 4,
                  height: 22,
                  backgroundColor: COLORS.navy,
                  opacity: Math.floor(frame / 8) % 2 === 0 ? 1 : 0,
                }}
              />
            </div>
            <div style={{ marginTop: 16, height: 10, borderRadius: 5, backgroundColor: "#DCE4F5", width: "80%" }} />
            <div style={{ marginTop: 10, height: 10, borderRadius: 5, backgroundColor: "#DCE4F5", width: "60%" }} />
          </div>
        </div>

        {/* Icons popping around the phone */}
        <IconBadge x={140} y={760} scale={icon1.scale} opacity={icon1.opacity}>
          {/* magnifier */}
          <svg width="70" height="70" viewBox="0 0 24 24" fill="none">
            <circle cx="10" cy="10" r="6.5" stroke={COLORS.blue} strokeWidth="2.6" />
            <line x1="15" y1="15" x2="21" y2="21" stroke={COLORS.blue} strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        </IconBadge>
        <IconBadge x={120} y={1080} scale={icon2.scale} opacity={icon2.opacity}>
          {/* SNS bubble + heart */}
          <svg width="70" height="70" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 5 h16 v11 h-9 l-4 4 v-4 h-3 z"
              stroke={COLORS.blue}
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <path
              d="M12 13 l-2.4-2.4 a1.7 1.7 0 1 1 2.4-2.4 a1.7 1.7 0 1 1 2.4 2.4 z"
              fill={COLORS.blue}
            />
          </svg>
        </IconBadge>
        <IconBadge x={640} y={1260} scale={icon3.scale} opacity={icon3.opacity}>
          {/* browser/website */}
          <svg width="70" height="70" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="15" rx="2.5" stroke={COLORS.blue} strokeWidth="2.2" />
            <line x1="3" y1="9" x2="21" y2="9" stroke={COLORS.blue} strokeWidth="2.2" />
            <circle cx="6.4" cy="6.6" r="0.9" fill={COLORS.blue} />
            <circle cx="9.4" cy="6.6" r="0.9" fill={COLORS.blue} />
          </svg>
        </IconBadge>
      </div>

      {/* Overlay text */}
      <div
        style={{
          position: "absolute",
          top: 340,
          width: "100%",
          textAlign: "center",
          opacity: textOp,
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 84,
            color: COLORS.white,
            letterSpacing: "0.02em",
          }}
        >
          お客様はまず
          <span style={{ color: COLORS.blue }}>検索</span>します。
        </div>
      </div>
    </AbsoluteFill>
  );
};
