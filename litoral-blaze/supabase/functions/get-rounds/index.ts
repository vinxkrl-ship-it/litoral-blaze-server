// supabase/functions/get-rounds/index.ts
// Edge Function rodando no servidor do Supabase — sem problemas de CORS
// Faz scraping do bestblaze.com.br e retorna as rodadas em JSON

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Cor pelo número do Double
function getColor(num: number): string {
  if (num === 0) return 'white'
  if (num >= 1 && num <= 7) return 'red'
  return 'black'
}

function parseRounds(html: string) {
  const rounds: Array<{id:string,num:number,color:string,time:string}> = []
  // Padrão no bestblaze: número + espaço + HH:MM:SS
  // Ex: "9 22:11:27" ou "0 21:34:51"
  const regex = /\b([0-9]|1[0-4])\s+(\d{2}:\d{2}:\d{2})\b/g
  const today = new Date().toISOString().slice(0, 10)
  let match
  while ((match = regex.exec(html)) !== null) {
    const num   = parseInt(match[1])
    const time  = match[2]
    const iso   = `${today}T${time}.000Z`
    const id    = `${today}_${time.replace(/:/g,'')}_${num}`
    rounds.push({ id, num, color: getColor(num), time: iso })
  }
  // Remove duplicatas e ordena do mais antigo para o mais recente
  const seen = new Set<string>()
  return rounds
    .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true })
    .sort((a, b) => a.time.localeCompare(b.time))
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const res = await fetch('https://www.bestblaze.com.br/doubleRodadasDia', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Referer': 'https://www.bestblaze.com.br/',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(12000),
    })

    if (!res.ok) {
      throw new Error(`bestblaze retornou HTTP ${res.status}`)
    }

    const html   = await res.text()
    const rounds = parseRounds(html)

    if (rounds.length === 0) {
      throw new Error('Nenhuma rodada encontrada no HTML do bestblaze')
    }

    return new Response(
      JSON.stringify({ ok: true, rounds, count: rounds.length, ts: Date.now() }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('get-rounds error:', err.message)
    return new Response(
      JSON.stringify({ ok: false, error: err.message, rounds: [] }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
