// Vercel serverless function: forwards VidyaVerse AI requests to the Anthropic API
// and streams the answer back as plain text. Your API key stays on the server.

const MODELS = {
  quick: process.env.MODEL_QUICK || "claude-haiku-4-5-20251001",
  default: process.env.MODEL_DEFAULT || "claude-sonnet-5-5",
  complex: process.env.MODEL_COMPLEX || process.env.MODEL_DEFAULT || "claude-sonnet-5-5",
};
const LIMIT = Number(process.env.RATE_LIMIT_PER_MIN || 20); // requests per visitor per minute
const hits = new Map();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: "ANTHROPIC_API_KEY is not set" });

  // Simple per-visitor rate limit (best effort; resets when the function restarts)
  const ip = String(req.headers["x-forwarded-for"] || "anon").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= LIMIT) return res.status(429).json({ error: "Too many requests, wait a minute" });
  recent.push(now);
  hits.set(ip, recent);

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  let { messages = [], tier = "default", images = [] } = body || {};

  messages = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-14)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user")
    return res.status(400).json({ error: "The last message must come from the student" });

  if (Array.isArray(images) && images.length && typeof images[0] === "string" && images[0].length < 3_000_000) {
    const last = messages[messages.length - 1];
    last.content = [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: images[0] } },
      { type: "text", text: last.content },
    ];
  }

  let upstream;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODELS[tier] || MODELS.default, max_tokens: 2000, stream: true, messages }),
    });
  } catch {
    return res.status(502).json({ error: "Could not reach the AI service" });
  }
  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 300);
    console.error("Anthropic error", upstream.status, detail);
    return res.status(upstream.status === 429 ? 429 : 502).json({ error: "AI service error" });
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");

  const reader = upstream.body.getReader();
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
      try {
        const ev = JSON.parse(line.slice(5).trim());
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") res.write(ev.delta.text);
      } catch { /* ignore keep-alive lines */ }
    }
  }
  res.end();
}
