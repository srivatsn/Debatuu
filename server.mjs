import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const root = resolve(".");
await loadEnv(resolve(root, ".env"));
const port = Number(process.env.PORT || 4173);
const speechCache = new Map();

function foundryOpenAIBase() {
  if (process.env.AZURE_OPENAI_BASE_URL) return process.env.AZURE_OPENAI_BASE_URL.replace(/\/$/, "");
  const project = process.env.AZURE_AI_PROJECT_ENDPOINT || "";
  if (!project) return "";
  const url = new URL(project);
  return `${url.origin}/openai/v1`;
}

async function loadEnv(path) {
  try {
    const text = await readFile(path, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index < 1) continue;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

async function readJson(req, maxBytes = 100_000) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Request is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function speech(req, res) {
  if (!process.env.AZURE_AI_API_KEY) return json(res, 503, { error: "Add AZURE_AI_API_KEY to .env, then restart the server." });
  const { speaker, text } = await readJson(req);
  if (!["Maya", "Leo"].includes(speaker) || typeof text !== "string" || !text.trim() || text.length > 1200) return json(res, 400, { error: "Invalid speech request." });
  const voice = speaker === "Maya" ? (process.env.MAYA_VOICE || "coral") : (process.env.LEO_VOICE || "ash");
  const model = process.env.AZURE_AI_SPEECH_DEPLOYMENT || "gpt-4o-mini-tts";
  const cacheKey = `${model}|${voice}|${text}`;
  const cached = speechCache.get(cacheKey);
  if (cached) { res.writeHead(200, { "content-type":"audio/mpeg", "cache-control":"private, max-age=86400", "content-length":cached.length, "x-debatuu-cache":"hit" }); return res.end(cached); }
  const instructions = speaker === "Maya"
    ? "Maintain one consistent character voice for Maya in every line: warm, thoughtful, bright, and conversational, with a steady medium-high pitch and relaxed pace. She is a friendly teenage debate mentor. Keep the same vocal identity, accent, pitch range, energy, and cadence across all clips. Use gentle natural pauses. Never sound like an announcer or change character."
    : "Maintain one consistent character voice for Leo in every line: youthful teenage boy, light and energetic, with a medium-high pitch, quick friendly cadence, and a hint of playful curiosity. Keep the same vocal identity, accent, pitch range, energy, and cadence across all clips. Do not use a deep, booming, mature, gravelly, or announcer voice.";
  try {
    const upstream = await fetch(`${foundryOpenAIBase()}/audio/speech`, {
      method: "POST",
      headers: { "content-type": "application/json", "api-key": process.env.AZURE_AI_API_KEY },
      body: JSON.stringify({ model, voice, input: text, instructions, response_format: "mp3" })
    });
    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 600);
      return json(res, upstream.status, { error: "Azure speech request failed. Confirm that the speech deployment exists.", detail });
    }
    const audio = Buffer.from(await upstream.arrayBuffer());
    speechCache.set(cacheKey, audio);
    res.writeHead(200, { "content-type": upstream.headers.get("content-type") || "audio/mpeg", "cache-control": "private, max-age=86400", "content-length": audio.length, "x-debatuu-cache":"miss" });
    res.end(audio);
  } catch (error) { json(res, 502, { error: "Could not reach Azure AI Foundry.", detail: error.message }); }
}

async function critique(req, res) {
  if (!process.env.AZURE_AI_API_KEY) return json(res, 503, { error: "Azure AI is not configured." });
  const { topic, transcript } = await readJson(req);
  if (typeof transcript !== "string" || !transcript.trim() || transcript.length > 12_000) return json(res, 400, { error: "A transcript is required." });
  const prompt = `You coach 12-year-old students in debating. Topic: ${String(topic || "Unknown topic").slice(0,300)}\nStudent transcript:\n${transcript}\nReturn concise, kind, specific feedback as JSON with integer scores from 1 to 5 for clear_position, reasoning, evidence, rebuttal, organization, and delivery; plus strongest_moment, next_step, and retry_sentence. Never shame the student.`;
  try {
    const upstream = await fetch(`${foundryOpenAIBase()}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", "api-key": process.env.AZURE_AI_API_KEY },
      body: JSON.stringify({ model: process.env.AZURE_AI_CRITIQUE_DEPLOYMENT || "gpt-5.4-mini", input: prompt })
    });
    const result = await upstream.json();
    if (!upstream.ok) return json(res, upstream.status, { error: "Azure critique request failed.", detail: result });
    json(res, 200, result);
  } catch (error) { json(res, 502, { error: "Could not reach Azure AI Foundry.", detail: error.message }); }
}

const types = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png" };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, { ok: true, azureConfigured: Boolean(process.env.AZURE_AI_API_KEY), speechDeployment: process.env.AZURE_AI_SPEECH_DEPLOYMENT, critiqueDeployment: process.env.AZURE_AI_CRITIQUE_DEPLOYMENT });
    if (req.method === "POST" && url.pathname === "/api/speech") return await speech(req, res);
    if (req.method === "POST" && url.pathname === "/api/critique") return await critique(req, res);
    if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
    const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const file = resolve(root, `.${pathname}`);
    if (!file.startsWith(root) || [".env", ".mjs"].includes(extname(file))) return json(res, 404, { error: "Not found" });
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" }); res.end(body);
  } catch (error) { if (error.code === "ENOENT") json(res, 404, { error: "Not found" }); else json(res, 500, { error: error.message }); }
});
server.listen(port, () => console.log(`Debatuu running at http://127.0.0.1:${port}`));
