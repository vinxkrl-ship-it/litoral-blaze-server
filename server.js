const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
//  MIDDLEWARES
// ============================================================
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ============================================================
//  STORAGE LOCAL (arquivo JSON — persiste no Render via disco)
//  O Render tem disco efêmero, mas com o plano pago tem disco
//  persistente. Para plano gratuito, os dados sobrevivem até
//  o servidor reiniciar (suficiente para uso contínuo).
//  Para garantia total, usamos arquivo + memória.
// ============================================================
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('Erro ao carregar data.json:', e.message);
  }
  return {};
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('Erro ao salvar data.json:', e.message);
  }
}

// Carrega dados na memória ao iniciar
let KV_STORE = loadData();

// ============================================================
//  ENDPOINTS KV — usados pelo index.html para dados globais
// ============================================================

// GET /kv/:key — lê um valor
app.get('/kv/:key', (req, res) => {
  const key = req.params.key;
  const value = KV_STORE[key];
  if (value === undefined) {
    return res.json({ key, value: null });
  }
  res.json({ key, value });
});

// POST /kv/:key — salva um valor
app.post('/kv/:key', (req, res) => {
  const key = req.params.key;
  const { value } = req.body;
  if (value === undefined) {
    return res.status(400).json({ error: 'value obrigatório' });
  }
  KV_STORE[key] = value;
  saveData(KV_STORE);
  res.json({ ok: true, key, value });
});

// DELETE /kv/:key — apaga um valor
app.delete('/kv/:key', (req, res) => {
  const key = req.params.key;
  delete KV_STORE[key];
  saveData(KV_STORE);
  res.json({ ok: true, key });
});

// ============================================================
//  ENDPOINTS DOUBLE — proxy das rodadas da Blaze em tempo real
// ============================================================
const BLAZE_URL = 'https://blaze.com/api/roulette_games/recent';
const BLAZE_DOUBLE_URL = 'https://blaze.com/api/roulette_games/recent?game_mode=NORMAL';

let cachedRounds = [];
let lastFetch = 0;
let lastUpdate = 0;

async function fetchBlazeRounds() {
  try {
    const urls = [
      'https://blaze.com/api/roulette_games/recent?game_mode=NORMAL',
      'https://blaze1.com/api/roulette_games/recent?game_mode=NORMAL',
    ];
    let data = null;
    for (const url of urls) {
      try {
        const r = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: 8000,
        });
        if (r.ok) { data = await r.json(); break; }
      } catch (e) { /* tenta próxima URL */ }
    }
    if (!data || !Array.isArray(data)) return;
    const colorMap = { 0: 'white', 1: 'red', 2: 'black' };
    const mapped = data.map(r => ({
      id: r.id,
      num: r.roll,
      color: colorMap[r.color] || 'red',
      time: r.created_at,
    }));
    if (mapped.length > 0) {
      const newLatest = mapped[mapped.length - 1]?.id;
      const oldLatest = cachedRounds[cachedRounds.length - 1]?.id;
      if (newLatest !== oldLatest) lastUpdate = Date.now();
      cachedRounds = mapped;
    }
  } catch (e) {
    console.warn('Erro fetchBlazeRounds:', e.message);
  }
}

// Busca rodadas a cada 2 segundos
setInterval(fetchBlazeRounds, 2000);
fetchBlazeRounds(); // busca imediatamente ao iniciar

// GET /recent — retorna últimas 30 rodadas
app.get('/recent', async (req, res) => {
  if (cachedRounds.length === 0) await fetchBlazeRounds();
  const recent = cachedRounds.slice(-30);
  res.json({
    success: true,
    data: recent,
    count: recent.length,
    lastUpdate,
    serverTime: Date.now(),
  });
});

// GET /load-all — retorna todas as rodadas em cache
app.get('/load-all', async (req, res) => {
  if (cachedRounds.length === 0) await fetchBlazeRounds();
  res.json({
    success: true,
    data: cachedRounds,
    count: cachedRounds.length,
    lastUpdate,
  });
});

// ============================================================
//  HEALTH CHECK
// ============================================================
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    name: 'LITORAL BLAZE 14X — Server',
    rounds: cachedRounds.length,
    kvKeys: Object.keys(KV_STORE),
    uptime: Math.floor(process.uptime()) + 's',
    serverTime: new Date().toISOString(),
  });
});

app.get('/status', (req, res) => {
  res.json({
    online: true,
    rounds: cachedRounds.length,
    users: (KV_STORE['users'] || []).length,
    signals: (KV_STORE['signals'] || []).length,
    lastUpdate,
  });
});

// ============================================================
//  START
// ============================================================
app.listen(PORT, () => {
  console.log(`✅ LITORAL BLAZE SERVER rodando na porta ${PORT}`);
  console.log(`📦 KV Store: ${Object.keys(KV_STORE).length} chaves carregadas`);
});
