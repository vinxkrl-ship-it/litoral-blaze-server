// ================================================================
//  LITORAL BLAZE 14X — BACKEND
//  Express + JSON file database (zero dependências nativas)
//  Funciona em qualquer Node.js sem compilação
// ================================================================

import express from 'express';
import cors    from 'cors';
import path    from 'path';
import fs      from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3000;

// ── Banco de dados JSON ─────────────────────────────────────────
const DB_DIR  = process.env.DB_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch(e) { console.error('Erro ao ler DB:', e.message); }
  return { users: [], signals: [], settings: { admin_pass: 'admin123', ai_enabled: true } };
}

function saveDB(data) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8'); }
  catch(e) { console.error('Erro ao salvar DB:', e.message); }
}

// Inicializa
let DB = loadDB();
console.log(`✅ DB carregado: ${DB.users.length} usuários, ${DB.signals.length} sinais`);

// ── Middlewares ─────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(__dirname));

// ── Helpers ─────────────────────────────────────────────────────
const now = () => new Date().toISOString();
const uid = () => 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);

// ── HEALTH ──────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: Date.now(), users: DB.users.length, signals: DB.signals.length });
});

app.get('/api/ping', (req, res) => {
  res.json({ ok: true, users: DB.users.length, signals: DB.signals.length, ts: Date.now() });
});

// ── USUÁRIOS ────────────────────────────────────────────────────

app.get('/api/users', (req, res) => {
  const safe = DB.users.map(u => ({ ...u, password: undefined }));
  res.json({ ok: true, users: safe });
});

app.post('/api/users/register', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !password) return res.json({ ok: false, error: 'Campos obrigatórios' });
  if (username.length < 3)    return res.json({ ok: false, error: 'Usuário muito curto (mín. 3 letras)' });

  const u = username.toLowerCase().trim();
  if (DB.users.find(x => x.username === u))
    return res.json({ ok: false, error: 'Usuário já existe' });

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
  if (!user) return res.json({ ok: false, error: 'Usuário não encontrado' });
  user.status = 'active';
  user.approved_at = now();
  saveDB(DB);
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
  saveDB(DB);
  res.json({ ok: true });
});

// ── SINAIS ──────────────────────────────────────────────────────

app.get('/api/signals', (req, res) => {
  const sorted = [...DB.signals].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ ok: true, signals: sorted.slice(0, 100) });
});

app.post('/api/signals', (req, res) => {
  const { time_str, protection, confidence, pillars, note, is_ai } = req.body || {};
  if (!time_str) return res.json({ ok: false, error: 'Horário obrigatório' });

  const dup = DB.signals.find(x => x.time_str === time_str && (x.status === 'active' || x.status === 'pending'));
  if (dup) return res.json({ ok: false, error: 'Já existe sinal ativo para esse horário' });

  const signal = {
    sig_id: uid(), time_str, protection: protection||6,
    confidence: confidence||85, pillars: pillars||0,
    note: note||'', status: 'active', is_ai: !!is_ai,
    result_time: null, created_at: now()
  };
  DB.signals.push(signal);
  saveDB(DB);
  res.json({ ok: true, signal });
});

app.patch('/api/signals/:sig_id', (req, res) => {
  const { status, result_time } = req.body || {};
  const sig = DB.signals.find(x => x.sig_id === req.params.sig_id);
  if (!sig) return res.json({ ok: false, error: 'Sinal não encontrado' });
  sig.status = status;
  sig.result_time = result_time || now();
  saveDB(DB);
  res.json({ ok: true });
});

app.delete('/api/signals/:sig_id', (req, res) => {
  DB.signals = DB.signals.filter(x => x.sig_id !== req.params.sig_id);
  saveDB(DB);
  res.json({ ok: true });
});

app.post('/api/signals/reset', (req, res) => {
  const { type } = req.body || {};
  if (type === 'all' || type === 's') {
    DB.signals = [];
  } else if (type === 'stats') {
    DB.signals.forEach(x => { if (x.status === 'win' || x.status === 'loss') x.status = 'expired'; });
  }
  saveDB(DB);
  res.json({ ok: true });
});

// ── CONFIGURAÇÕES ───────────────────────────────────────────────

app.get('/api/settings', (req, res) => {
  res.json({ ok: true, ai_enabled: DB.settings.ai_enabled !== false });
});

app.post('/api/settings', (req, res) => {
  const { ai_enabled, admin_pass } = req.body || {};
  if (ai_enabled !== undefined) DB.settings.ai_enabled = !!ai_enabled;
  if (admin_pass)               DB.settings.admin_pass = admin_pass;
  saveDB(DB);
  res.json({ ok: true });
});

app.post('/api/settings/admin-login', (req, res) => {
  const { password } = req.body || {};
  const stored = DB.settings.admin_pass || 'admin123';
  res.json({ ok: password === stored });
});

// ── PROXY RODADAS DA BLAZE ───────────────────────────────────────
const BLAZE_URLS = [
  'https://blaze1.space/api/roulette_games/recent',
  'https://blaze.bet.br/api/roulette_games/recent',
];

async function fetchBlaze(take = 60) {
  let lastErr;
  for (const base of BLAZE_URLS) {
    try {
      const url = `${base}?take=${take}`;
      const r = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000)
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const raw = await r.json();
      return raw;
    } catch(e) { lastErr = e; }
  }
  throw lastErr;
}

function normalizeBlaze(raw) {
  const arr = Array.isArray(raw) ? raw : (raw.records || raw.data || []);
  return arr.map(item => ({
    id:    String(item.id),
    num:   item.roll ?? item.number ?? 0,
    color: item.color === 0 ? 'white' : item.color === 1 ? 'red' : 'black',
    time:  item.created_at || new Date().toISOString()
  })).reverse();
}

app.get('/recent', async (req, res) => {
  try {
    const raw = await fetchBlaze(60);
    const data = normalizeBlaze(raw);
    res.json({ ok: true, data, lastUpdate: Date.now() });
  } catch(e) {
    console.error('/recent error:', e.message);
    res.status(502).json({ ok: false, error: e.message, data: [] });
  }
});

app.get('/load-all', async (req, res) => {
  try {
    const raw = await fetchBlaze(1000);
    const data = normalizeBlaze(raw);
    res.json({ ok: true, success: true, data, count: data.length });
  } catch(e) {
    console.error('/load-all error:', e.message);
    res.status(502).json({ ok: false, success: false, data: [], count: 0 });
  }
});

// ── 404 ─────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'Rota não encontrada: ' + req.path });
  }
  const index = path.join(__dirname, 'index.html');
  if (fs.existsSync(index)) res.sendFile(index);
  else res.status(404).send('index.html não encontrado na pasta public/');
});

// ── START ────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LITORAL BLAZE SERVER na porta ${PORT}`);
  console.log(`📁 Banco: ${DB_FILE}`);
});
