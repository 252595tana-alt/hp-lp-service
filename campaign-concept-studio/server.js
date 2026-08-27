import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const openAIKey = process.env.OPENAI_API_KEY;
const textModel = process.env.OPENAI_TEXT_MODEL || "gpt-5.6-terra";
const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-5.6-terra";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

const campaignSchema = {
  type: "object",
  additionalProperties: false,
  required: ["concept", "copyVariants", "launchChecklist", "imagePrompts"],
  properties: {
    concept: {
      type: "object",
      additionalProperties: false,
      required: ["name", "oneLiner", "strategicRationale", "audiencePromise"],
      properties: {
        name: { type: "string" },
        oneLiner: { type: "string" },
        strategicRationale: { type: "string" },
        audiencePromise: { type: "string" }
      }
    },
    copyVariants: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "body", "channelFit"],
        properties: {
          headline: { type: "string" },
          body: { type: "string" },
          channelFit: { type: "string" }
        }
      }
    },
    launchChecklist: {
      type: "array",
      minItems: 6,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["task", "owner", "timing"],
        properties: {
          task: { type: "string" },
          owner: { type: "string" },
          timing: { type: "string" }
        }
      }
    },
    imagePrompts: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "prompt", "usage"],
        properties: {
          label: { type: "string" },
          prompt: { type: "string" },
          usage: { type: "string" }
        }
      }
    }
  }
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function validateBrief(payload) {
  const fields = ["brief", "audience", "product", "tone", "channels"];
  const values = Object.fromEntries(fields.map((field) => [field, String(payload[field] || "").trim()]));
  const missing = fields.filter((field) => values[field].length < 3);
  if (missing.length) {
    return { error: `Please complete: ${missing.join(", ")}` };
  }
  return { values };
}

async function createResponse(body) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${openAIKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.error?.message || `OpenAI request failed with ${response.status}`;
    throw new Error(detail);
  }
  return data;
}

function parseStructuredText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return JSON.parse(response.output_text);
  }

  const text = response.output
    ?.flatMap((item) => item.content || [])
    ?.find((content) => content.type === "output_text")?.text;

  if (!text) throw new Error("The text response did not include JSON output.");
  return JSON.parse(text);
}

function extractImageData(response) {
  const imageItem = response.output?.find((item) => item.type === "image_generation_call");
  if (imageItem?.result) return `data:image/png;base64,${imageItem.result}`;
  return null;
}

function buildCampaignInput(values) {
  return [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            "Create a campaign concept package for a marketing team.",
            "Return practical, presentation-ready content.",
            "Keep the concept concise and differentiated.",
            "",
            `Campaign brief: ${values.brief}`,
            `Target audience: ${values.audience}`,
            `Product details: ${values.product}`,
            `Tone: ${values.tone}`,
            `Desired channels: ${values.channels}`
          ].join("\n")
        }
      ]
    }
  ];
}

async function generateCampaign(values) {
  const response = await createResponse({
    model: textModel,
    instructions: [
      "You are a senior creative strategist for performance-minded marketing teams.",
      "Avoid generic slogans. Tie the concept to audience tension, product benefit, and channel fit.",
      "Write concise copy. Checklist tasks should be launch-ready and concrete."
    ].join(" "),
    input: buildCampaignInput(values),
    text: {
      format: {
        type: "json_schema",
        name: "campaign_concept_package",
        strict: true,
        schema: campaignSchema
      }
    }
  });

  return parseStructuredText(response);
}

async function generateImage(prompt, conceptName) {
  const response = await createResponse({
    model: imageModel,
    tools: [{ type: "image_generation", size: "1024x1024", quality: "medium" }],
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              `Generate one polished campaign direction image for "${conceptName}".`,
              "No legible text, no logos, no watermarks.",
              "Use this art direction prompt:",
              prompt
            ].join("\n")
          }
        ]
      }
    ]
  });

  return extractImageData(response);
}

async function handleGenerate(req, res) {
  if (!openAIKey) {
    sendJson(res, 500, { error: "OPENAI_API_KEY is not set on the server." });
    return;
  }

  try {
    const payload = JSON.parse(await readBody(req));
    const validation = validateBrief(payload);
    if (validation.error) {
      sendJson(res, 400, { error: validation.error });
      return;
    }

    const campaign = await generateCampaign(validation.values);
    const selectedPrompts = campaign.imagePrompts.slice(0, 2);
    const images = await Promise.all(
      selectedPrompts.map(async (item) => ({
        ...item,
        image: await generateImage(item.prompt, campaign.concept.name)
      }))
    );

    sendJson(res, 200, {
      ...campaign,
      images,
      meta: {
        textModel,
        imageModel,
        boundary: "Browser sends campaign inputs to this server. This server reads OPENAI_API_KEY and calls the OpenAI Responses API."
      }
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Something went wrong." });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const extension = path.extname(filePath);
    res.writeHead(200, { "content-type": MIME_TYPES[extension] || "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/generate") {
    handleGenerate(req, res);
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }
  res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
  res.end("Method not allowed");
});

server.listen(port, () => {
  console.log(`Campaign Concept Studio running at http://localhost:${port}`);
});
