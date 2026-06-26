// ================================================================
//  LITORAL BLAZE 14X — BACKEND COMPLETO
//  Express + JSON DB + Proxy Blaze API + WebSocket tempo real
// ================================================================

import express  from 'express';
import cors     from 'cors';
import path     from 'path';
import fs       from 'fs';
import http     from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath }   from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });
const PORT   = process.env.PORT || 3000;

// ── Banco de dados JSON ─────────────────────────────────────────
const DB_DIR  = process.env.DB_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

function loadDB() {
  try { if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch(e) { console.error('Erro DB:', e.message); }
  return { users: [], signals: [], settings: { admin_pass: 'admin123', ai_enabled: true } };
}
function saveDB(d) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2), 'utf8'); }
  catch(e) { console.error('Erro salvar DB:', e.message); }
}
let DB = loadDB();
console.log(`✅ DB: ${DB.users.length} usuários, ${DB.signals.length} sinais`);

// ── Helpers ─────────────────────────────────────────────────────
const now = () => new Date().toISOString();
const uid = () => 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);

// ── Middlewares ──────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(__dirname));

// ================================================================
//  BLAZE API — POLLING EM TEMPO REAL
// ================================================================

// URLs da API da Blaze (tenta em ordem até uma funcionar)
const BLAZE_APIS = [
  'https://blaze.bet.br/api/roulette_games/recent?take=100',
  'https://blaze1.space/api/roulette_games/recent?take=100',
  'https://blaze2.space/api/roulette_games/recent?take=100',
  'https://blazeapiproxy.com/api/roulette_games/recent?take=100',
];

// Cache de rounds em memória
let roundsCache   = [];
let lastRoundId   = null;
let lastFetchOk   = false;
let lastFetchTime = 0;

function normalizeRounds(raw) {
  const arr = Array.isArray(raw) ? raw : (raw.records || raw.data || []);
  return arr
    .filter(x => x && x.id != null)
    .map(item => ({
      id:    String(item.id),
      num:   item.roll ?? item.number ?? 0,
      color: item.color === 0 ? 'white' : item.color === 1 ? 'red' : 'black',
      time:  item.created_at || new Date().toISOString()
    }))
    .reverse(); // mais antigo primeiro
}

async function fetchBlazeRounds(take = 100) {
  for (const url of BLAZE_APIS) {
    try {
      const fullUrl = url.replace('take=100', `take=${take}`);
      const r = await fetch(fullUrl, {
        headers: {
          'Accept':     'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(8000)
      });
      if (!r.ok) continue;
      const raw = await r.json();
      const data = normalizeRounds(raw);
      if (data.length > 0) return data;
    } catch(e) {
      // tenta próxima URL
    }
  }
  return null;
}

// Broadcast para todos os clientes WebSocket conectados
function broadcast(event, data) {
  const msg = JSON.stringify({ event, data, ts: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      try { client.send(msg); } catch(e) {}
    }
  });
}

// Polling agressivo — checa a cada 1 segundo
async function pollBlaze() {
  try {
    const data = await fetchBlazeRounds(100);
    if (!data) {
      lastFetchOk = false;
      return;
    }
    lastFetchOk   = true;
    lastFetchTime = Date.now();

    const newLatestId = data.length ? data[data.length - 1].id : null;

    if (newLatestId !== lastRoundId) {
      // Tem rodada nova!
      const newRounds = roundsCache.length
        ? data.filter(r => !roundsCache.find(x => x.id === r.id))
        : data;

      roundsCache = data;
      lastRoundId = newLatestId;

      if (newRounds.length > 0) {
        console.log(`🎲 ${newRounds.length} rodada(s) nova(s) | último: ${newLatestId} | cor: ${newRounds[newRounds.length-1].color}`);
        // Empurra via WebSocket para todos os clientes
        broadcast('new_rounds', {
          rounds:    newRounds,
          all:       data,
          latestId:  newLatestId
        });
      }
    }
  } catch(e) {
    lastFetchOk = false;
    console.error('pollBlaze error:', e.message);
  }
}

// Inicia polling — 1 segundo
setInterval(pollBlaze, 1000);
pollBlaze(); // primeira chamada imediata

// ── WebSocket ────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  console.log('🔌 Cliente WS conectado. Total:', wss.clients.size);

  // Manda o estado atual imediatamente ao conectar
  ws.send(JSON.stringify({
    event: 'init',
    data:  { rounds: roundsCache, latestId: lastRoundId },
    ts:    Date.now()
  }));

  ws.on('close', () => {
    console.log('🔌 Cliente WS desconectado. Total:', wss.clients.size);
  });

  ws.on('error', () => {});
});

// ── ROTAS HTTP ───────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: Date.now(), rounds: roundsCache.length, lastFetchOk, lastFetchTime, wsClients: wss.clients.size });
});

// /recent — compatibilidade com o frontend antigo
app.get('/recent', (req, res) => {
  res.json({ ok: true, data: roundsCache, lastUpdate: lastFetchTime });
});

// /load-all
app.get('/load-all', async (req, res) => {
  const data = await fetchBlazeRounds(1000);
  if (data) {
    roundsCache = data;
    if (data.length) lastRoundId = data[data.length-1].id;
    res.json({ ok: true, success: true, data, count: data.length });
  } else {
    res.json({ ok: true, success: true, data: roundsCache, count: roundsCache.length });
  }
});

// ── USUÁRIOS ─────────────────────────────────────────────────────

app.get('/api/users', (req, res) => {
  res.json({ ok: true, users: DB.users.map(u => ({ ...u, password: undefined })) });
});

app.post('/api/users/register', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !password) return res.json({ ok: false, error: 'Campos obrigatórios' });
  if (username.length < 3)    return res.json({ ok: false, error: 'Usuário muito curto' });
  const u = username.toLowerCase().trim();
  if (DB.users.find(x => x.username === u)) return res.json({ ok: false, error: 'Usuário já existe' });
  const user = { id: uid(), username: u, email: email||'', password, status: 'free', created_at: now(), approved_at: null };
  DB.users.push(user);
  saveDB(DB);
  const { password: _, ...safe } = user;
  res.json({ ok: true, user: safe });
});

app.post('/api/users/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.json({ ok: false, error: 'Campos obrigatórios' });
  const user = DB.users.find(x => x.username === username.toLowerCase().trim() && x.password === password);
  if (!user) return res.json({ ok: false, error: 'Usuário ou senha incorretos' });
  const { password: _, ...safe } = user;
  res.json({ ok: true, user: safe });
});

app.post('/api/users/approve', (req, res) => {
  const { username } = req.body || {};
  const user = DB.users.find(x => x.username === username);
  if (!user) return res.json({ ok: false, error: 'Não encontrado' });
  user.status = 'active'; user.approved_at = now(); saveDB(DB);
  res.json({ ok: true });
});

app.post('/api/users/revoke', (req, res) => {
  const { username } = req.body || {};
  const user = DB.users.find(x => x.username === username);
  if (user) { user.status = 'free'; user.approved_at = null; saveDB(DB); }
  res.json({ ok: true });
});

app.delete('/api/users/:username', (req, res) => {
  DB.users = DB.users.filter(x => x.username !== req.params.username);
  saveDB(DB); res.json({ ok: true });
});

// ── SINAIS ───────────────────────────────────────────────────────

app.get('/api/signals', (req, res) => {
  const sorted = [...DB.signals].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ ok: true, signals: sorted.slice(0,100) });
});

app.post('/api/signals', (req, res) => {
  const { time_str, protection, confidence, pillars, note, is_ai } = req.body || {};
  if (!time_str) return res.json({ ok: false, error: 'Horário obrigatório' });
  const dup = DB.signals.find(x => x.time_str === time_str && (x.status==='active'||x.status==='pending'));
  if (dup) return res.json({ ok: false, error: 'Já existe sinal ativo para esse horário' });
  const signal = { sig_id: uid(), time_str, protection: protection||6, confidence: confidence||85, pillars: pillars||0, note: note||'', status: 'active', is_ai: !!is_ai, result_time: null, created_at: now() };
  DB.signals.push(signal);
  saveDB(DB);
  // Notifica clientes via WS
  broadcast('new_signal', signal);
  res.json({ ok: true, signal });
});

app.patch('/api/signals/:sig_id', (req, res) => {
  const { status, result_time } = req.body || {};
  const sig = DB.signals.find(x => x.sig_id === req.params.sig_id);
  if (!sig) return res.json({ ok: false, error: 'Não encontrado' });
  sig.status = status; sig.result_time = result_time || now(); saveDB(DB);
  broadcast('signal_update', sig);
  res.json({ ok: true });
});

app.delete('/api/signals/:sig_id', (req, res) => {
  DB.signals = DB.signals.filter(x => x.sig_id !== req.params.sig_id);
  saveDB(DB); res.json({ ok: true });
});

app.post('/api/signals/reset', (req, res) => {
  const { type } = req.body || {};
  if (type==='all'||type==='s') DB.signals = [];
  else if (type==='stats') DB.signals.forEach(x => { if(x.status==='win'||x.status==='loss') x.status='expired'; });
  saveDB(DB); res.json({ ok: true });
});

// ── CONFIGURAÇÕES ────────────────────────────────────────────────

app.get('/api/settings', (req, res) => {
  res.json({ ok: true, ai_enabled: DB.settings.ai_enabled !== false });
});

app.post('/api/settings', (req, res) => {
  const { ai_enabled, admin_pass } = req.body || {};
  if (ai_enabled !== undefined) DB.settings.ai_enabled = !!ai_enabled;
  if (admin_pass) DB.settings.admin_pass = admin_pass;
  saveDB(DB); res.json({ ok: true });
});

app.post('/api/settings/admin-login', (req, res) => {
  const { password } = req.body || {};
  res.json({ ok: password === (DB.settings.admin_pass || 'admin123') });
});

// ── 404 ──────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'Rota não encontrada' });
  const index = path.join(__dirname, 'index.html');
  if (fs.existsSync(index)) res.sendFile(index);
  else res.status(404).send('index.html não encontrado');
});

// ── START ────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📁 DB: ${DB_FILE}`);
  console.log(`🔌 WebSocket ativo`);
});
