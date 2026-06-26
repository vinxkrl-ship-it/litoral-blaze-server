import { useState, useEffect, useRef } from 'react'
import { analyze, getRiskStreak, getStats, getSigWindow } from '../lib/ai'
import { toast } from './Toast'
import { PayBox } from './LoginPage'
import { supabase } from '../lib/supabase'

export default function UserApp({ profile, rounds, online, signals, onLogout, onUpdateSignal }) {
  const [showPaywall, setShowPaywall]   = useState(false)
  const [freeUsed,    setFreeUsed]      = useState(false)
  const [aiEnabled,   setAiEnabled]     = useState(true)
  const [countdown,   setCountdown]     = useState({})
  const prevSignalIds = useRef(new Set())
  const isPaid = profile?.status === 'active'

  // Fetch AI setting
  useEffect(() => {
    supabase.from('settings').select('value').eq('key','ai_enabled').single()
      .then(({data}) => { if(data) setAiEnabled(data.value === 'true') })
  }, [])

  // Paywall for free users after first resolved signal
  useEffect(() => {
    if (isPaid || freeUsed) return
    const resolved = signals.filter(s => s.status==='win' || s.status==='loss')
    if (resolved.length >= 1) {
      setFreeUsed(true)
      setTimeout(() => setShowPaywall(true), 3000)
    }
  }, [signals, isPaid, freeUsed])

  // Auto win/loss check
  useEffect(() => {
    if (!rounds.length || !signals.length) return
    signals.forEach(async sig => {
      if (sig.status !== 'active') return
      const { startW, endW } = getSigWindow(sig.time_str)
      const white = rounds.find(r => { const t=new Date(r.time); return t>=startW&&t<=endW&&r.color==='white' })
      if (white) {
        await onUpdateSignal(sig.id, { status:'win', result_time: white.time })
        toast(`✅ WIN! Branco às ${white.time.slice(11,16)}`, 'success')
        return
      }
      const now = new Date()
      if (now > endW) {
        const after = rounds.filter(r => new Date(r.time) > endW)
        if (after.length >= 1) {
          await onUpdateSignal(sig.id, { status:'loss', result_time: now.toISOString() })
          toast(`❌ LOSS no sinal ${sig.time_str}`, 'error')
        }
      }
    })
  }, [rounds])

  // AI auto-send
  useEffect(() => {
    if (!aiEnabled || !rounds.length) return
    const r = analyze(rounds, signals, aiEnabled)
    if (!r.shouldSend) return
    const dup = signals.find(s => (s.status==='active'||s.status==='pending') && s.time_str===r.time)
    if (dup) return
    supabase.from('signals').insert({ time_str:r.time, protection:6, confidence:r.confidence, note:`${r.activeCount}/5 pilares · gatilho:${r.trigger}`, is_ai:true, status:'active' })
      .then(() => toast(`🤖 IA: BRANCO ${r.time} (${r.confidence}%)`, 'success'))
  }, [rounds])

  // Countdown timers for active signals
  useEffect(() => {
    const t = setInterval(() => {
      const newCd = {}
      signals.filter(s=>s.status==='active').forEach(sig => {
        const { endW } = getSigWindow(sig.time_str)
        const rem = Math.max(0, Math.ceil((endW - new Date()) / 1000))
        newCd[sig.id] = rem
      })
      setCountdown(newCd)
    }, 1000)
    return () => clearInterval(t)
  }, [signals])

  const aiResult  = analyze(rounds, signals, aiEnabled)
  const risk      = getRiskStreak(rounds)
  const stats     = getStats(rounds, signals)
  const actives   = signals.filter(s => s.status==='active' || s.status==='pending')
  const lastRound = rounds[rounds.length - 1]
  const last30    = rounds.slice(-30)
  const circ      = 2 * Math.PI * 52
  const fillArc   = (stats.rate / 100) * circ
  const rateColor = stats.rate>=70?'var(--green)':stats.rate>=40?'var(--gold)':'var(--red)'

  // Bars: whites per hour
  const now = new Date()
  const barHours = Array.from({length:12},(_,i)=>(now.getHours()-11+i+24)%24)
  const barData  = barHours.map(h => {
    const today = new Date(); today.setHours(h,0,0,0)
    return rounds.filter(r=>{const t=new Date(r.time);return t.getHours()===h&&t.getDate()===today.getDate()&&r.color==='white'}).length
  })
  const barMax = Math.max(...barData, 1)

  return (
    <div className="app visible">
      {/* HEADER */}
      <header className="header">
        <div className="h-logo">
          <img src="/logo.png" alt="Logo" onError={e=>e.target.style.display='none'} />
          <div className="t">LITORAL <span>BLAZE</span> 14X</div>
        </div>
        <div className="h-right">
          <div className={`h-live ${online?'':'offline'}`}>
            <div className="dot"></div>
            <span>{online?'AO VIVO':'OFFLINE'}</span>
          </div>
          <div className="h-user">
            <div className="av">{(profile?.username||'U').charAt(0).toUpperCase()}</div>
            <div className="n">{profile?.username}</div>
            <span className={`h-badge ${isPaid?'vip':'free'}`}>{isPaid?'VIP':'FREE'}</span>
          </div>
          <button className="btn-icon" onClick={onLogout}><i className="fas fa-sign-out-alt"></i></button>
        </div>
      </header>

      <main className="main">
        {/* RISK BANNER */}
        {risk.isRisk && (
          <div className="risk-banner">
            <div className="risk-icon">⚠️</div>
            <div className="risk-text">
              <strong>ALERTA DE RISCO — MUITAS RODADAS SEM BRANCO</strong>
              <span>{risk.streak} rodadas sem branco (máx histórico: {risk.historicalMax}). Padrão de alto risco — aguarde.</span>
            </div>
          </div>
        )}

        {/* HERO SIGNALS */}
        {actives.length === 0 ? (
          <div className="hero" style={{marginBottom:'1.2rem'}}>
            <div className="hero-chip idle">—</div>
            <div className="hero-info">
              <div className="hero-tag idle"><i className="fas fa-pause"></i> AGUARDANDO SINAL</div>
              <div className="hero-title">Nenhum sinal ativo</div>
              <div className="hero-desc">A IA está analisando os padrões em tempo real</div>
            </div>
            <div className="hero-timer">
              <div className="hero-timer-lbl">Última Rodada</div>
              <div className={`hero-timer-val ${online?'':'dim'}`}>
                {lastRound ? new Date(lastRound.time).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '--:--'}
              </div>
            </div>
          </div>
        ) : (
          (!isPaid && showPaywall) ? null : actives.map(sig => {
            const rem = countdown[sig.id] ?? 0
            const mm  = String(Math.floor(rem/60)).padStart(2,'0')
            const ss  = String(rem%60).padStart(2,'0')
            return (
              <div key={sig.id} className="hero active" style={{marginBottom:'.8rem'}}>
                <div className="hero-chip signal">14X</div>
                <div className="hero-info">
                  <div className="hero-tag live"><div className="dot"></div> SINAL ATIVO{sig.is_ai?' 🤖':''}</div>
                  <div className="hero-title">⚪ BRANCO — {sig.time_str}</div>
                  <div className="hero-desc">{sig.note||'Entrada com proteção'}</div>
                  <div className="hero-meta">
                    <div className="hero-meta-item"><i className="fas fa-clock"></i> {sig.time_str}</div>
                    <div className="hero-meta-item"><i className="fas fa-shield-alt"></i> {sig.protection} rodadas</div>
                    <div className="hero-meta-item"><i className="fas fa-chart-line"></i> {sig.confidence}%</div>
                  </div>
                </div>
                <div className="hero-timer">
                  <div className="hero-timer-lbl">Janela fecha em</div>
                  <div className={`hero-timer-val ${rem<30?'red':''}`}>{rem>0?`${mm}:${ss}`:'Encerrando'}</div>
                </div>
              </div>
            )
          })
        )}

        {/* PAYWALL */}
        {showPaywall && !isPaid && (
          <div className="paywall">
            <img src="/logo.png" alt="" onError={e=>e.target.style.display='none'} />
            <h2>SINAL <span>REVELADO!</span></h2>
            <p>Você viu seu sinal gratuito. Para acesso ilimitado 24h, faça o pagamento agora!</p>
            <PayBox />
          </div>
        )}

        {/* AI BAR */}
        <div className="ai-bar">
          <div className="ai-icon"><i className="fas fa-brain"></i></div>
          <div className="ai-text">
            <div className="ai-text-lbl">IA LITORAL — 5 PILARES DINÂMICOS</div>
            <div className="ai-text-msg">{aiResult.reason||'Analisando padrões em tempo real...'}</div>
          </div>
          <div className="ai-pills">
            {[1,2,3,4,5].map(n => (
              <div key={n} className={`pill ${aiResult.pillars?.[`p${n}`]?'on':''}`}>{n}</div>
            ))}
          </div>
        </div>

        {/* ROUNDS */}
        <div className="roundbox">
          <div className="roundbox-head">
            <div className="roundbox-title"><i className="fas fa-circle-notch"></i> Últimas Rodadas Double</div>
            <div className="roundbox-counter">Total: <span>{rounds.length}</span></div>
          </div>
          <div className="rounds-row">
            {last30.map((r,i) => (
              <div key={r.id} className={`rd ${r.color} ${i===last30.length-1?'latest':''}`}>{r.num}</div>
            ))}
          </div>
        </div>

        {/* STATS */}
        <div className="stats">
          <div className="stat w"><div className="stat-lbl"><i className="fas fa-trophy"></i> WINS</div><div className="stat-val">{stats.wins}</div></div>
          <div className="stat l"><div className="stat-lbl"><i className="fas fa-times"></i> LOSSES</div><div className="stat-val">{stats.losses}</div></div>
          <div className="stat r"><div className="stat-lbl"><i className="fas fa-percentage"></i> WIN RATE</div><div className="stat-val">{stats.rate}%</div></div>
          <div className="stat t"><div className="stat-lbl"><i className="fas fa-signal"></i> SINAIS</div><div className="stat-val">{stats.totalSignals}</div></div>
        </div>

        {/* GRID */}
        <div className="grid2">
          {/* Signal History */}
          <div className="card">
            <div className="card-h"><div className="card-t"><i className="fas fa-history"></i> Histórico de Sinais</div></div>
            <div className="card-b">
              {signals.length === 0 ? (
                <p style={{color:'var(--text-3)',textAlign:'center',padding:'2rem',fontSize:'.82rem'}}>Aguardando sinais...</p>
              ) : [...signals].slice(0,30).map(sig => {
                let tag='⏳ AGUARDANDO', cls='pending'
                if(sig.status==='win'){tag='✅ WIN';cls='win'}
                else if(sig.status==='loss'){tag='❌ LOSS';cls='loss'}
                else if(sig.status==='active'){tag='🔴 ATIVO';cls='pending'}
                return (
                  <div key={sig.id} className="sig">
                    <div className="sig-chip">14X</div>
                    <div className="sig-info">
                      <h4>Branco 14X — {sig.time_str}{sig.is_ai?' 🤖':''}</h4>
                      <span>{sig.note||'Proteção'} · {sig.confidence}%</span>
                    </div>
                    <span className={`sig-tag ${cls}`}>{tag}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Donut */}
          <div className="card">
            <div className="card-h"><div className="card-t"><i className="fas fa-chart-pie"></i> Taxa de Acerto</div></div>
            <div className="card-b">
              <div className="donut-w">
                <div className="donut">
                  <svg viewBox="0 0 120 120">
                    <circle className="bg" cx="60" cy="60" r="52"/>
                    <circle className="fl" cx="60" cy="60" r="52" style={{stroke:rateColor,strokeDasharray:`${fillArc} ${circ}`}}/>
                  </svg>
                  <div className="donut-c">
                    <div className="donut-v" style={{color:rateColor}}>{stats.rate}%</div>
                    <div className="donut-l">WIN RATE</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BARS */}
        <div className="card" style={{marginBottom:'1.2rem'}}>
          <div className="card-h"><div className="card-t"><i className="fas fa-chart-bar"></i> Brancos por Hora (Hoje)</div></div>
          <div className="card-b">
            <div className="bars-wrap">
              <div className="bars">
                {barData.map((v,i) => (
                  <div key={i} className={`bar ${v===0?'empty':v>=stats.stopWhites?'danger':'normal'}`}
                    style={{height:`${(v/barMax)*100}%`}} title={`${v} brancos`}></div>
                ))}
              </div>
              <div className="bar-lbls">
                {barHours.map((h,i) => <div key={i} className="bar-l">{String(h).padStart(2,'0')}h</div>)}
              </div>
            </div>
          </div>
        </div>

        <div className="footer">
          <img src="/logo.png" alt="" onError={e=>e.target.style.display='none'}/>
          <p>🔥 <span style={{color:'var(--red)',fontWeight:600}}>LITORAL BLAZE 14X</span> · SIGNALS</p>
          <p>Jogue com responsabilidade · +18</p>
        </div>
      </main>
    </div>
  )
}
