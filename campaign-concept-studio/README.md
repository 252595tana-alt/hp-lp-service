# Campaign Concept Studio

A full-stack campaign concept generator for marketing teams. Users enter a short campaign brief, target audience, product details, tone, and desired channels. The server calls the current OpenAI Responses API to generate:

- A concise campaign concept
- 3 headline/body copy variants
- A launch checklist
- Image prompts and generated campaign direction images

## Client/server boundary

The browser never receives `OPENAI_API_KEY` and never calls OpenAI directly.

- Client: `public/app.js` collects form input and posts it to `POST /api/generate`.
- Server: `server.js` reads `OPENAI_API_KEY`, calls `https://api.openai.com/v1/responses`, and returns only generated campaign content and base64 image data to the client.

This keeps the API key off the client and makes it possible to add auth, rate limiting, logging, or moderation later.

## OpenAI API usage

This project uses the Responses API, not legacy Completions or Chat Completions.

- Text generation: `POST /v1/responses` with structured JSON output via `text.format.type = "json_schema"`.
- Image generation: `POST /v1/responses` with the built-in `image_generation` tool.

Model defaults are kept in environment variables:

- `OPENAI_TEXT_MODEL=gpt-5.6-terra`
- `OPENAI_IMAGE_MODEL=gpt-5.6-terra`

OpenAI's current model docs recommend the GPT-5.6 family for production API usage, with `gpt-5.6-terra` as a balance of quality and cost. The GPT-Image-2 model is the dedicated image model if you later want to switch image generation to the Images API or an image-specific Responses flow.

Official references:

- Models: https://developers.openai.com/api/docs/models
- Responses API: https://developers.openai.com/api/reference/cli/resources/responses/methods/create
- GPT-Image-2: https://developers.openai.com/api/docs/models/gpt-image-2
- Quickstart and API key environment variable: https://platform.openai.com/docs/quickstart/make-your-first-api-request

## Install

Node.js 20 or newer is required.

```bash
npm install
```

This app currently uses only Node built-ins, so `npm install` is quick and may not create a large dependency tree.

## Environment setup

Create a local `.env`:

```bash
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_TEXT_MODEL=gpt-5.6-terra
OPENAI_IMAGE_MODEL=gpt-5.6-terra
PORT=3000
```

The `dev` and `start` scripts load `.env` automatically when it exists. You can also set variables directly in Windows PowerShell:

```powershell
$env:OPENAI_API_KEY="your_openai_api_key_here"
$env:OPENAI_TEXT_MODEL="gpt-5.6-terra"
$env:OPENAI_IMAGE_MODEL="gpt-5.6-terra"
npm run dev
```

Do not commit real API keys.

## Run

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Deployment notes

Deploy as a Node.js server app, not as a purely static site, because OpenAI calls must stay server-side.

Recommended production steps:

1. Set `OPENAI_API_KEY` in the hosting provider's environment variables.
2. Keep `OPENAI_TEXT_MODEL` and `OPENAI_IMAGE_MODEL` configurable.
3. Add request rate limiting before public launch.
4. Add basic analytics for generation success, latency, and error rate.
5. Add authentication if the studio is for an internal marketing team.

## Validation plan

Before shipping:

1. Run `npm run validate` to check the server syntax.
2. Start the app with `npm run dev`.
3. Submit a complete sample brief and confirm concept, 3 copy variants, checklist items, image prompts, and images render.
4. Submit with a missing field and confirm the error state appears.
5. Start without `OPENAI_API_KEY` and confirm the server returns a clear configuration error.
6. Inspect the browser bundle and confirm no OpenAI key is exposed client-side.

## Where to adjust later

- Model: change `OPENAI_TEXT_MODEL` or `OPENAI_IMAGE_MODEL` in the environment.
- Prompt: edit `generateCampaign()` and `generateImage()` in `server.js`.
- Structured output shape: edit `campaignSchema` in `server.js`.
- Image settings: edit the `image_generation` tool options in `generateImage()`.
- UI polish: edit `public/index.html`, `public/styles.css`, and `public/app.js`.
