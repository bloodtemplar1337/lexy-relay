// relay_server.js
// Minimal relay with in-memory per-host queues, token auth, and simple reporting.

import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---- config / auth ----
const TOKEN = process.env.LEXY_TOKEN || "";
if (!TOKEN) console.warn("[Relay] Warning: LEXY_TOKEN env var is empty!");

function auth(req, res) {
  const t = (req.body?.token || req.headers["x-lexy-token"] || "").toString();
  if (!TOKEN || t === TOKEN) return true;
  res.status(401).json({ error: "unauthorized" });
  return false;
}

// ---- in-memory queues & reports (reset on deploy; fine for our use)
const queues = new Map();  // key: `${token}:${host}` -> array of packets
const reports = [];        // last ~200 reports
const MAX_REPORTS = 200;

function keyFor(token, host) { return `${token}:${host || "default"}`; }
function qGet(k) { if (!queues.has(k)) queues.set(k, []); return queues.get(k); }

// ---- endpoints ----

// Basic heartbeat (kept for compatibility)
app.post("/ping", (req, res) => {
  if (!auth(req, res)) return;
  res.json({ ok: true });
});

// Enqueue a packet for a host (what we used to call /reply)
app.post("/reply", (req, res) => {
  if (!auth(req, res)) return;
  const host = (req.body?.host || req.body?.HOST || "default").toString();
  const packet = req.body;
  // Normalize: ensure an actions array if present
  if (packet && packet.actions && !Array.isArray(packet.actions)) {
    return res.status(400).json({ error: "actions must be an array" });
  }
  const k = keyFor(TOKEN, host);
  qGet(k).push(packet);
  console.log(`[Relay] queued for host=${host} | actions=${packet?.actions?.length || 0}`);
  res.json({ ok: true, queued: qGet(k).length });
});

// Helper pulls next packet for its host
app.post("/pull", (req, res) => {
  if (!auth(req, res)) return;
  const host = (req.body?.host || "default").toString();
  const k = keyFor(TOKEN, host);
  const q = qGet(k);
  if (!q.length) return res.status(204).end(); // no content
  const packet = q.shift();
  console.log(`[Relay] pulled by host=${host} | remaining=${q.length}`);
  res.json(packet);
});

// Optional: helper status reports (queue_worker uses this best-effort)
app.post("/report", (req, res) => {
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

// Small debug to see queue sizes (secure by token header)
app.get("/stats", (req, res) => {
  const t = (req.headers["x-lexy-token"] || "").toString();
  if (TOKEN && t !== TOKEN) return res.status(401).json({ error: "unauthorized" });
  const stats = {};
  for (const [k, arr] of queues) stats[k] = arr.length;
  res.json({ ok: true, queues: stats, reports: reports.slice(-10) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[Relay] listening on ${PORT}`));
