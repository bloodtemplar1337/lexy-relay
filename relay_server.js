// relay_server.js — ESM relay with per-host queues + token auth (supports two env var names)
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// --- auth (supports both names) ---
const TOKEN =
  process.env.LEXY_RELAY_TOKEN ||
  process.env.LEXY_TOKEN ||
  "";

if (!TOKEN) console.warn("[Relay] Warning: LEXY_RELAY_TOKEN/LEXY_TOKEN is empty!");

// body or header auth helper
function authed(req, res) {
  const t = (req.body?.token || req.headers["x-lexy-token"] || "").toString();
  if (!TOKEN || t === TOKEN) return true;
  res.status(401).json({ error: "unauthorized" });
  return false;
}

// --- in-memory state ---
const queues = new Map();    // key: `${token}:${host}` -> array of packets
const reports = [];
const MAX_REPORTS = 200;

const key = (token, host) => `${token}:${host || "default"}`;
const q = k => (queues.has(k) ? queues.get(k) : queues.set(k, []).get(k));

// --- endpoints ---
app.post("/ping", (req, res) => {
  if (!authed(req, res)) return;
  res.json({ ok: true });
});

app.post("/reply", (req, res) => {
  if (!authed(req, res)) return;
  const host = (req.body?.host || req.body?.HOST || "default").toString();
  const packet = req.body;
  if (packet?.actions && !Array.isArray(packet.actions)) {
    return res.status(400).json({ error: "actions must be an array" });
  }
  const k = key(TOKEN, host);
  q(k).push(packet);
  console.log(`[Relay] queued host=${host} actions=${packet?.actions?.length || 0} qlen=${q(k).length}`);
  res.json({ ok: true, queued: q(k).length });
});

app.post("/pull", (req, res) => {
  if (!authed(req, res)) return;
  const host = (req.body?.host || "default").toString();
  const k = key(TOKEN, host);
  const arr = q(k);
  if (!arr.length) return res.status(204).end();
  const packet = arr.shift();
  console.log(`[Relay] pulled host=${host} remaining=${arr.length}`);
  res.json(packet);
});

app.post("/report", (req, res) => {
  // allow without auth to avoid losing liveness notes
  const r = {
    ts: new Date().toISOString(),
    host: req.body?.host || "unknown",
    status: req.body?.status || "unknown",
    detail: req.body?.detail || ""
  };
  reports.push(r);
  if (reports.length > MAX_REPORTS) reports.shift();
  console.log(`[Report] ${r.host} :: ${r.status} :: ${r.detail}`);
  res.json({ ok: true });
});

app.get("/stats", (req, res) => {
  // header auth only so you can open from a browser with X-Lexy-Token
  const t = (req.headers["x-lexy-token"] || "").toString();
  if (TOKEN && t !== TOKEN) return res.status(401).json({ error: "unauthorized" });
  const out = {};
  for (const [k, arr] of queues) out[k] = arr.length;
  res.json({ ok: true, queues: out, reports: reports.slice(-10) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[Relay] listening on ${PORT}`));
