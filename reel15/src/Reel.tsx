import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { COLORS, SHOTS } from "./tokens";
import { Shot1 } from "./shots/Shot1";
import { Shot2 } from "./shots/Shot2";
import { Shot3 } from "./shots/Shot3";
import { Shot4 } from "./shots/Shot4";
import { Shot5 } from "./shots/Shot5";
import { Shot6 } from "./shots/Shot6";
import { Shot7 } from "./shots/Shot7";

export const Reel: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.navy }}>
      <Audio src={staticFile("audio/narration.mp3")} />
      <Sequence from={SHOTS.s1.from} durationInFrames={SHOTS.s1.dur}>
        <Shot1 />
      </Sequence>
      <Sequence from={SHOTS.s2.from} durationInFrames={SHOTS.s2.dur}>
        <Shot2 />
      </Sequence>
      <Sequence from={SHOTS.s3.from} durationInFrames={SHOTS.s3.dur}>
        <Shot3 />
      </Sequence>
      <Sequence from={SHOTS.s4.from} durationInFrames={SHOTS.s4.dur}>
        <Shot4 />
      </Sequence>
      <Sequence from={SHOTS.s5.from} durationInFrames={SHOTS.s5.dur}>
        <Shot5 />
      </Sequence>
      {/* Shot 6 fades in over the tail of Shot 5 (cross-dissolve) */}
      <Sequence from={SHOTS.s6.from - 8} durationInFrames={SHOTS.s6.dur + 8 + SHOTS.s7.dur}>
        <Shot6 />
      </Sequence>
      <Sequence from={SHOTS.s7.from} durationInFrames={SHOTS.s7.dur}>
        <Shot7 />
      </Sequence>
    </AbsoluteFill>
  );
};
