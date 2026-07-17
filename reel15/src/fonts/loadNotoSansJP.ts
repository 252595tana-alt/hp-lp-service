import { continueRender, delayRender, staticFile } from "remotion";
import { NOTO_SANS_JP_MANIFEST } from "./notosansjp-manifest";

// Fonts are self-hosted under public/fonts/notosansjp instead of being
// fetched from Google's CDN at render time, so the render works in
// network-restricted environments (only the subset actually used by the
// shots is bundled).
export const FONT_FAMILY = "Noto Sans JP";

let loaded = false;

export const loadNotoSansJP = (): void => {
  if (loaded) {
    return;
  }
  loaded = true;

  if (typeof FontFace === "undefined") {
    return;
  }

  for (const entry of NOTO_SANS_JP_MANIFEST) {
    const handle = delayRender(
      `Loading Noto Sans JP weight ${entry.weight} (${entry.file})`,
    );
    const fontFace = new FontFace(
      FONT_FAMILY,
      `url(${staticFile(`fonts/notosansjp/${entry.file}`)}) format('woff2')`,
      {
        weight: String(entry.weight),
        style: "normal",
        unicodeRange: entry.unicodeRange,
      },
    );
    fontFace
      .load()
      .then((loadedFace) => {
        document.fonts.add(loadedFace);
        continueRender(handle);
      })
      .catch((err) => {
        console.error("Failed to load font chunk", entry.file, err);
        continueRender(handle);
      });
  }
};
