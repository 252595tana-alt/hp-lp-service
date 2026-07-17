import { Composition } from "remotion";
import { Reel } from "./Reel";
import { FPS, TOTAL_FRAMES } from "./tokens";

export const Root: React.FC = () => {
  return (
    <Composition
      id="Reel15"
      component={Reel}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1080}
      height={1920}
    />
  );
};
