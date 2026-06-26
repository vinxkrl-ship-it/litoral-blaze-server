// ================================================================
//  LITORAL BLAZE 14X — SERVIDOR COMPLETO
//  Fonte de dados: bestblaze.com.br/doubleRodadasDia (scraping)
//  Banco: JSON em disco (persistente no Render via /var/data)
//  Tempo real: WebSocket push para todos os clientes
// ================================================================

import express from 'express';
import cors    from 'cors';
import path    from 'path';
import fs      from 'fs';
import http    from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath }   from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });
const PORT   = process.env.PORT || 3000;

// ── Banco de dados JSON ──────────────────────────────────────────
const DB_DIR  = process.env.DB_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch(e) { console.error('Erro ao ler DB:', e.message); }
  return { users: [], signals: [], settings: { admin_pass: 'admin123', ai_enabled: true } };
}
function saveDB() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2), 'utf8'); }
  catch(e) { console.error('Erro ao salvar DB:', e.message); }
}
let DB = loadDB();
console.log(`✅ DB carregado: ${DB.users.length} usuários, ${DB.signals.length} sinais`);

const uid  = () => 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
const now  = () => new Date().toISOString();

// ── Middlewares ──────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(__dirname));

// ================================================================
//  SCRAPING — bestblaze.com.br/doubleRodadasDia
// ================================================================

// Mapa de cor por número (Double Blaze)
// 0 = branco, 1-7 = vermelho, 8-14 = preto
function getColor(num) {
  if (num === 0) return 'white';
  if (num >= 1 && num <= 7) return 'red';
  return 'black';
}

function parseRounds(html) {
  const rounds = [];
  // Padrão: número seguido de HH:MM:SS
  // Ex: "9 22:11:27" ou "0 21:34:51"
  const regex = /\b(\d{1,2})\s+(\d{2}:\d{2}:\d{2})\b/g;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let match;
  while ((match = regex.exec(html)) !== null) {
    const num  = parseInt(match[1]);
    const time = match[2];
    if (num < 0 || num > 14) continue;
    // Ignora linhas de estatística (ex: "23 5 1 17" sem horário — já filtrado pelo regex)
    const iso = `${today}T${time}.000Z`;
    const id  = `${today}_${time.replace(/:/g,'')}_${num}`;
    rounds.push({ id, num, color: getColor(num), time: iso });
  }
  // Remove duplicatas pelo id, ordena do mais antigo para o mais recente
  const seen = new Set();
  return rounds
    .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    .sort((a, b) => a.time.localeCompare(b.time));
}

// Cache em memória
let roundsCache  = [];
let lastRoundId  = null;
let lastFetchOk  = false;
let lastFetchAt  = 0;
const SOURCE_URL = 'https://www.bestblaze.com.br/doubleRodadasDia';

async function fetchRounds() {
  try {
    const r = await fetch(SOURCE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Referer': 'https://www.bestblaze.com.br/',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(12000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html   = await r.text();
    const rounds = parseRounds(html);
    if (!rounds.length) throw new Error('Nenhuma rodada encontrada no HTML');
    return rounds;
  } catch(e) {
    console.error('fetchRounds error:', e.message);
    return null;
  }
}

function broadcast(event, data) {
  const msg = JSON.stringify({ event, data, ts: Date.now() });
  wss.clients.forEach(c => {
    if (c.readyState === 1) try { c.send(msg); } catch(e) {}
  });
}

// Polling a cada 3 segundos
async function pollRounds() {
  const data = await fetchRounds();
  if (!data || !data.length) {
    lastFetchOk = false;
    return;
  }
  lastFetchOk = true;
  lastFetchAt = Date.now();

  const newLatest = data[data.length - 1].id;
  if (newLatest === lastRoundId) return; // nada novo

  // Descobre quais são novas
  const existingIds = new Set(roundsCache.map(r => r.id));
  const newRounds   = data.filter(r => !existingIds.has(r.id));

  roundsCache = data;
  lastRoundId = newLatest;

  if (newRounds.length) {
    const last = newRounds[newRounds.length - 1];
    console.log(`🎲 ${newRounds.length} nova(s) | ${last.num} (${last.color}) às ${last.time.slice(11,19)}`);
    broadcast('new_rounds', { rounds: newRounds, all: data, latestId: newLatest });
  }
}

setInterval(pollRounds, 3000); // checa a cada 3s
pollRounds();                   // imediato na inicialização

// ── WebSocket ────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  console.log(`🔌 WS conectado (total: ${wss.clients.size})`);
  // Envia estado atual imediatamente
  ws.send(JSON.stringify({
    event: 'init',
    data:  { rounds: roundsCache, latestId: lastRoundId },
    ts:    Date.now()
  }));
  ws.on('close', () => console.log(`🔌 WS desconectado (total: ${wss.clients.size})`));
  ws.on('error', () => {});
});

// ================================================================
//  ROTAS HTTP
// ================================================================

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now(), rounds: roundsCache.length, lastFetchOk, lastFetchAt, wsClients: wss.clients.size });
});

// Compatibilidade com o frontend
app.get('/recent', (_req, res) => {
  res.json({ ok: true, data: roundsCache.slice(-100), lastUpdate: lastFetchAt });
});
app.get('/load-all', (_req, res) => {
  res.json({ ok: true, success: true, data: roundsCache, count: roundsCache.length });
});

// ── USUÁRIOS ─────────────────────────────────────────────────────

app.get('/api/users', (_req, res) => {
  res.json({ ok: true, users: DB.users.map(({ password, ...u }) => u) });
});

app.post('/api/users/register', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !password) return res.json({ ok: false, error: 'Campos obrigatórios' });
  if (username.length < 3)    return res.json({ ok: false, error: 'Usuário muito curto (mín. 3 caracteres)' });
  const u = username.toLowerCase().trim();
  if (DB.users.find(x => x.username === u)) return res.json({ ok: false, error: 'Usuário já existe' });
  const user = { id: uid(), username: u, email: email||'', password, status: 'free', created_at: now(), approved_at: null };
  DB.users.push(user);
  saveDB();
  const { password: _, ...safe } = user;
  console.log(`👤 Novo usuário: ${u}`);
  res.json({ ok: true, user: safe });
});

app.post('/api/users/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.json({ ok: false, error: 'Campos obrigatórios' });
  const user = DB.users.find(x => x.username === username.toLowerCase().trim() && x.password === password);
  if (!user) return res.json({ ok: false, error: 'Usuário ou senha incorretos' });
  const { password: _, ...safe } = user;
  console.log(`🔑 Login: ${user.username} (${user.status})`);
  res.json({ ok: true, user: safe });
});

app.post('/api/users/approve', (req, res) => {
  const { username } = req.body || {};
  const user = DB.users.find(x => x.username === username);
  if (!user) return res.json({ ok: false, error: 'Usuário não encontrado' });
  user.status = 'active'; user.approved_at = now(); saveDB();
  broadcast('user_approved', { username });
  console.log(`✅ Aprovado: ${username}`);
  res.json({ ok: true });
});

app.post('/api/users/revoke', (req, res) => {
  const { username } = req.body || {};
  const user = DB.users.find(x => x.username === username);
  if (user) { user.status = 'free'; user.approved_at = null; saveDB(); }
  res.json({ ok: true });
});

app.delete('/api/users/:username', (req, res) => {
  const before = DB.users.length;
  DB.users = DB.users.filter(x => x.username !== req.params.username);
  if (DB.users.length < before) saveDB();
  res.json({ ok: true });
});

// ── SINAIS ───────────────────────────────────────────────────────

app.get('/api/signals', (_req, res) => {
  const sorted = [...DB.signals].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ ok: true, signals: sorted.slice(0, 100) });
});

app.post('/api/signals', (req, res) => {
  const { time_str, protection, confidence, pillars, note, is_ai } = req.body || {};
  if (!time_str) return res.json({ ok: false, error: 'Horário obrigatório' });
  const dup = DB.signals.find(x => x.time_str === time_str && (x.status === 'active' || x.status === 'pending'));
  if (dup) return res.json({ ok: false, error: 'Já existe sinal ativo para esse horário' });
  const signal = { sig_id: uid(), time_str, protection: protection||6, confidence: confidence||85, pillars: pillars||0, note: note||'', status: 'active', is_ai: !!is_ai, result_time: null, created_at: now() };
  DB.signals.push(signal);
  saveDB();
  broadcast('new_signal', signal);
  res.json({ ok: true, signal });
});

app.patch('/api/signals/:sig_id', (req, res) => {
  const { status, result_time } = req.body || {};
  const sig = DB.signals.find(x => x.sig_id === req.params.sig_id);
  if (!sig) return res.json({ ok: false, error: 'Sinal não encontrado' });
  sig.status = status; sig.result_time = result_time || now(); saveDB();
  broadcast('signal_update', sig);
  res.json({ ok: true });
});

app.delete('/api/signals/:sig_id', (req, res) => {
  DB.signals = DB.signals.filter(x => x.sig_id !== req.params.sig_id);
  saveDB(); res.json({ ok: true });
});

app.post('/api/signals/reset', (req, res) => {
  const { type } = req.body || {};
  if (type === 'all' || type === 's') { DB.signals = []; }
  else if (type === 'stats') { DB.signals.forEach(x => { if (x.status==='win'||x.status==='loss') x.status='expired'; }); }
  saveDB(); res.json({ ok: true });
});

// ── CONFIGURAÇÕES ────────────────────────────────────────────────

app.get('/api/settings', (_req, res) => {
  res.json({ ok: true, ai_enabled: DB.settings.ai_enabled !== false });
});

app.post('/api/settings', (req, res) => {
  const { ai_enabled, admin_pass } = req.body || {};
  if (ai_enabled !== undefined) DB.settings.ai_enabled = !!ai_enabled;
  if (admin_pass) DB.settings.admin_pass = admin_pass;
  saveDB(); res.json({ ok: true });
});

app.post('/api/settings/admin-login', (req, res) => {
  const { password } = req.body || {};
  const ok = password === (DB.settings.admin_pass || 'admin123');
  if (ok) console.log('🔑 Admin logou');
  res.json({ ok });
});

// ── 404 ──────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/') || req.path === '/recent' || req.path === '/load-all')
    return res.status(404).json({ ok: false, error: 'Rota não encontrada' });
  const idx = path.join(__dirname, 'index.html');
  if (fs.existsSync(idx)) res.sendFile(idx);
  else res.status(404).send('index.html não encontrado. Coloque o arquivo index.html na raiz do servidor.');
});

// ── START ────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LITORAL BLAZE rodando na porta ${PORT}`);
  console.log(`📁 DB: ${DB_FILE}`);
  console.log(`🌐 Fonte de dados: ${SOURCE_URL}`);
  console.log(`🔌 WebSocket ativo`);
});
