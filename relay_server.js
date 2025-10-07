import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.LEXY_TOKEN || 'CHANGE_ME_SECRET';
const INBOX = './inbox';
const OUTBOX = './outbox';

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
ensureDir(INBOX); ensureDir(OUTBOX);

app.post('/ping', (req, res) => {
  const data = req.body || {};
  if (!data.token || data.token !== TOKEN) return res.status(401).json({ error: 'unauthorized' });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(INBOX, `ping-${ts}.json`), JSON.stringify(data, null, 2), 'utf8');
  let reply = null;
  try {
    const latest = path.join(OUTBOX, 'response.json');
    if (fs.existsSync(latest)) reply = JSON.parse(fs.readFileSync(latest, 'utf8'));
  } catch {}
  return res.json(reply || { ok: true });
});

app.post('/reply', (req, res) => {
  const packet = req.body || {};
  fs.writeFileSync(path.join(OUTBOX, 'response.json'), JSON.stringify(packet, null, 2), 'utf8');
  return res.json({ ok: true });
});

app.listen(PORT, () => console.log(`[Relay] Listening on ${PORT}`));
