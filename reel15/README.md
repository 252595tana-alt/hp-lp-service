# HP営業マンリール(15秒 / 1080×1920 / 30fps)

「ホームページは名刺ではありません。」のInstagram広告リールを
Remotion(React)でMP4にレンダリングするプロジェクトです。

## 必要環境

- Node.js 18以上(20推奨)
- 初回レンダリング時にChrome Headless Shellが自動ダウンロードされます

## 手順

```bash
# 1. 依存関係のインストール
npm install

# 2. プレビュー(ブラウザでStudioが開き、シークバーで確認できます)
npm run dev

# 3. MP4書き出し(out/reel15.mp4 が生成されます)
npm run render
```

Claude Codeをお使いの場合は、このフォルダで Claude Code を起動して
「npm install して npm run render を実行して」と指示すればOKです。
文言・色・タイミングの修正もそのまま依頼できます。

## 音楽・SFXについて

このプロジェクトは映像のみです。BGMを入れる場合は:

1. `public/` フォルダを作成して `bgm.mp3` を配置
2. `src/Reel.tsx` に以下を追加

```tsx
import { Audio, staticFile } from "remotion";
// AbsoluteFill内の先頭に:
<Audio src={staticFile("bgm.mp3")} volume={0.8} />
```

フリーBGMは Artlist / Epidemic Sound / DOVA-SYNDROME などで
「corporate upbeat」を探すとイメージに合います。

## カスタマイズの目安

- 文言: 各 `src/shots/Shot*.tsx` 内の日本語テキストを直接編集
- 色: `src/tokens.ts` の COLORS
- 尺・タイミング: `src/tokens.ts` の SHOTS(フレーム単位、30fps)
- 30秒版が必要な場合: SHOTS の値を伸ばし、各ショットの
  interpolate 範囲を調整してください

## 構成(ショット対応表)

| ショット | 時間 | 内容 |
|---|---|---|
| Shot1 | 0-1.2s | 「ホームページは名刺ではありません。」ズームパンチ |
| Shot2 | 1.2-3.0s | 検索する経営者+アイコンポップ |
| Shot3 | 3.0-6.5s | SNS→HP→信頼→問い合わせ→売上 フロー |
| Shot4 | 6.5-9.5s | 集客・信頼構築・行動 3カード |
| Shot5 | 9.5-12s | ダッシュボード組み立て+4機能 |
| Shot6 | 12-14s | 「24時間働く営業マン。」 |
| Shot7 | 14-15s | 無料相談受付中+CTA アイコン |
