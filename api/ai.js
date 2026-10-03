// Vercel serverless function for VidyaVerse.
// Works with a FREE Google Gemini key (GEMINI_API_KEY) or a paid Anthropic key (ANTHROPIC_API_KEY).
// If both are set, Gemini is used. Answers are streamed back as plain text.

const LIMIT = Number(process.env.RATE_LIMIT_PER_MIN || 10); // requests per visitor per minute
const hits = new Map();

const GEMINI = {
  quick: process.env.GEMINI_MODEL_QUICK || "gemini-flash-lite-latest",
  default: process.env.GEMINI_MODEL || "gemini-flash-latest",
};
const CLAUDE = {
  quick: process.env.MODEL_QUICK || "claude-haiku-4-5-20251001",
  default: process.env.MODEL_DEFAULT || "claude-sonnet-5-5",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const geminiKey = process.env.GEMINI_API_KEY;
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  if (!geminiKey && !claudeKey) return res.status(503).json({ error: "No AI key is set" });

  const ip = String(req.headers["x-forwarded-for"] || "anon").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= LIMIT) return res.status(429).json({ error: "Too many requests, wait a minute" });
  recent.push(now);
  hits.set(ip, recent);

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  let { messages = [], tier = "default", images = [] } = body || {};
  tier = tier === "quick" ? "quick" : "default";

  messages = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-14)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user")
    return res.status(400).json({ error: "The last message must come from the student" });

  const image = Array.isArray(images) && typeof images[0] === "string" && images[0].length < 3_000_000 ? images[0] : null;

  try {
    if (geminiKey) await streamGemini(res, geminiKey, GEMINI[tier], messages, image);
    else await streamClaude(res, claudeKey, CLAUDE[tier], messages, image);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(e.status === 429 ? 429 : 502).json({ error: "AI service error" });
    else res.end();
  }
}

async function streamGemini(res, key, model, messages, image) {
  const contents = messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  if (image) contents[contents.length - 1].parts.unshift({ inline_data: { mime_type: "image/jpeg", data: image } });
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 2000 } }),
    }
  );
  if (!r.ok) throw Object.assign(new Error("Gemini " + r.status + ": " + (await r.text()).slice(0, 300)), { status: r.status });
  startText(res);
  await readSSE(r, (ev) => {
    const parts = ev?.candidates?.[0]?.content?.parts || [];
    for (const p of parts) if (p.text && !p.thought) res.write(p.text);
  });
  res.end();
}

async function streamClaude(res, key, model, messages, image) {
  if (image) {
    const last = messages[messages.length - 1];
    last.content = [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
      { type: "text", text: last.content },
    ];
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 2000, stream: true, messages }),
  });
  if (!r.ok) throw Object.assign(new Error("Anthropic " + r.status + ": " + (await r.text()).slice(0, 300)), { status: r.status });
  startText(res);
  await readSSE(r, (ev) => {
    if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") res.write(ev.delta.text);
  });
  res.end();
}

function startText(res) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
}
async function readSSE(r, onEvent) {
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try { onEvent(JSON.parse(data)); } catch { /* ignore */ }
    }
  }
}
