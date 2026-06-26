const express = require('express');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ============================================================
//  STORAGE (arquivo JSON — dados globais: users, signals, etc)
// ============================================================
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch(e) { console.warn('Erro ao carregar data.json:', e.message); }
  return {};
}
function saveData(data) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8'); }
  catch(e) { console.warn('Erro ao salvar data.json:', e.message); }
}

let KV_STORE = loadData();

// ============================================================
//  ENDPOINTS KV — dados globais (users, signals, config IA)
// ============================================================
app.get('/kv/:key', (req, res) => {
  const value = KV_STORE[req.params.key];
  res.json({ key: req.params.key, value: value !== undefined ? value : null });
});

app.post('/kv/:key', (req, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: 'value obrigatorio' });
  KV_STORE[req.params.key] = value;
  saveData(KV_STORE);
  res.json({ ok: true, key: req.params.key });
});

app.delete('/kv/:key', (req, res) => {
  delete KV_STORE[req.params.key];
  saveData(KV_STORE);
  res.json({ ok: true, key: req.params.key });
});

// ============================================================
//  SCRAPER — bestblaze.com.br (rodadas Double em tempo real)
// ============================================================
let cachedRounds = [];
let lastFetch = 0;
let lastUpdate = 0;

// Mapa de cores: 0 = branco, 1-7 = vermelho, 8-14 = preto
function getColor(num) {
  const n = parseInt(num);
  if (n === 0) return 'white';
  if (n >= 1 && n <= 7) return 'red';
  return 'black';
}

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchBlazeRounds() {
  try {
    const html = await fetchHtml('https://www.bestblaze.com.br/doubleRodadasDia');

    // Extrai pares: "NUMERO HH:MM:SS" do HTML
    // Padrão: número seguido de horário no texto
    const matches = [];
    // Regex: captura linhas com número e horário HH:MM:SS
    const regex = /\b(\d{1,2})\s+(\d{2}:\d{2}:\d{2})\b/g;
    let m;
    while ((m = regex.exec(html)) !== null) {
      const num = parseInt(m[1]);
      const timeStr = m[2]; // HH:MM:SS
      if (num >= 0 && num <= 14) {
        matches.push({ num, timeStr });
      }
    }

    if (matches.length === 0) {
      console.warn('Nenhuma rodada encontrada no HTML');
      return;
    }

    // Monta data completa com a data de hoje (ajuste para fuso BRT UTC-3)
    const todayBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const dateStr = todayBRT.toISOString().slice(0, 10); // YYYY-MM-DD

    const rounds = matches.map((r, i) => {
      const isoTime = `${dateStr}T${r.timeStr}-03:00`;
      return {
        id: `${dateStr}-${r.timeStr}`.replace(/:/g, ''),
        num: r.num,
        color: getColor(r.num),
        time: new Date(isoTime).toISOString(),
      };
    });

    // Ordena do mais antigo pro mais recente
    rounds.sort((a, b) => new Date(a.time) - new Date(b.time));

    // Remove duplicatas por id
    const seen = new Set();
    const unique = rounds.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id); return true;
    });

    if (unique.length > 0) {
      const newLatest = unique[unique.length - 1]?.id;
      const oldLatest = cachedRounds[cachedRounds.length - 1]?.id;
      if (newLatest !== oldLatest) lastUpdate = Date.now();
      cachedRounds = unique;
      console.log(`✅ ${unique.length} rodadas carregadas | último: ${unique[unique.length-1]?.time}`);
    }
  } catch(e) {
    console.warn('Erro fetchBlazeRounds:', e.message);
  }
}

// Busca a cada 30 segundos (o site não atualiza mais rápido que isso)
setInterval(fetchBlazeRounds, 30000);
fetchBlazeRounds();

// ============================================================
//  ENDPOINTS RODADAS
// ============================================================
app.get('/recent', (req, res) => {
  const recent = cachedRounds.slice(-50);
  res.json({ success: true, data: recent, count: recent.length, lastUpdate, serverTime: Date.now() });
});

app.get('/load-all', (req, res) => {
  res.json({ success: true, data: cachedRounds, count: cachedRounds.length, lastUpdate });
});

// ============================================================
//  HEALTH CHECK
// ============================================================
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    name: 'LITORAL BLAZE 14X — Server',
    rounds: cachedRounds.length,
    lastRound: cachedRounds[cachedRounds.length - 1] || null,
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
    lastRound: cachedRounds[cachedRounds.length - 1] || null,
  });
});

// ============================================================
//  START
// ============================================================
app.listen(PORT, () => {
  console.log(`✅ LITORAL BLAZE SERVER rodando na porta ${PORT}`);
});
