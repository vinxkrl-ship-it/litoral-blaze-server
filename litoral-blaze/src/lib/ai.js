import { getColor } from '../hooks/useRounds'

export function getColor2(num) { return getColor(num) }

export function analyze(rounds, signals, aiEnabled) {
  if (!aiEnabled) return { shouldSend: false, reason: 'IA desativada', pillars: {} }
  const today = getTodayRounds(rounds)
  if (today.length < 20) return { shouldSend: false, reason: 'Analisando padrões...', pillars: {} }

  const stopW = getDynamicStopWhites(today)
  const stopS = getDynamicStopSignals(today)
  if (whitesThisHour(today) >= stopW) return { shouldSend: false, reason: 'Limite de brancos/hora atingido', pillars: {} }
  if (signalsThisHour(signals) >= stopS) return { shouldSend: false, reason: 'Limite de sinais/hora atingido', pillars: {} }

  const p1 = pillar1(today)
  const p3 = pillar3(today)
  const p4 = pillar4(today)
  if (!p1.valid) return { shouldSend: false, reason: 'Analisando padrões...', pillars: { p1:false,p2:false,p3:p3.valid,p4:p4.detected,p5:false } }

  const lastNum    = today.length ? today[today.length - 1].num : null
  const triggerHit = p1.numbers.find(x => x.num === lastNum)
  const p2         = triggerHit ? pillar2(today, lastNum) : { valid: false, avg: 0 }
  const now        = new Date()
  const estimateMin = p2.avg || 5
  const targetMin   = (now.getMinutes() + estimateMin) % 60
  const isHotMin    = p3.minutes.some(x => Math.abs(x.min - targetMin) <= 2)
  const p5          = pillar5(today, targetMin)

  const activePillars = { p1: p1.valid && !!triggerHit, p2: p2.valid, p3: isHotMin, p4: p4.detected, p5: p5.detected }
  const count = Object.values(activePillars).filter(Boolean).length
  if (count < 4) return { shouldSend: false, reason: 'Analisando padrões...', pillars: activePillars }

  const target  = new Date(now.getTime() + estimateMin * 60000)
  const timeStr = `${String(target.getHours()).padStart(2,'0')}:${String(target.getMinutes()).padStart(2,'0')}`
  return { shouldSend: true, time: timeStr, confidence: Math.min(60 + count*5 + p5.boost, 98), pillars: activePillars, activeCount: count, reason: `🔥 SINAL: Branco ${timeStr}`, trigger: lastNum, estimateMin }
}

export function getRiskStreak(rounds) {
  const today = getTodayRounds(rounds)
  if (today.length < 10) return { streak:0, historicalMax:0, isRisk:false }
  let streak = 0
  for (let i = today.length - 1; i >= 0; i--) { if (today[i].color === 'white') break; streak++ }
  let max = 0, cur = 0
  for (const r of today) { if (r.color !== 'white') cur++; else { if (cur > max) max = cur; cur = 0 } }
  if (cur > max) max = cur
  return { streak, historicalMax: max, isRisk: streak >= Math.max(8, Math.floor(max * 0.8)) && streak >= 6 }
}

export function getStats(rounds, signals) {
  const today  = getTodayRounds(rounds)
  const whites = today.filter(r => r.color === 'white')
  const byHour = {}
  whites.forEach(r => { const h = new Date(r.time).getHours(); byHour[h] = (byHour[h]||0)+1 })
  const hours  = Object.keys(byHour).length || 1
  const counts = {}
  for (let i = 1; i < today.length; i++) { if (today[i].color==='white') { const p=today[i-1].num; counts[p]=(counts[p]||0)+1 } }
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]
  const w   = signals.filter(s=>s.status==='win').length
  const l   = signals.filter(s=>s.status==='loss').length
  return { total:today.length, whites:whites.length, avgPerHour:(whites.length/hours).toFixed(1), topTrigger:top?`${top[0]} (${top[1]}x)`:'—', stopWhites:getDynamicStopWhites(today), stopSignals:getDynamicStopSignals(today), wins:w, losses:l, rate:w+l>0?Math.round(w/(w+l)*100):0, totalSignals:signals.length }
}

// ── Internals ────────────────────────────────────────────────────
function getTodayRounds(rounds) {
  const t = new Date()
  return rounds.filter(r => { const d=new Date(r.time); return d.getDate()===t.getDate()&&d.getMonth()===t.getMonth()&&d.getFullYear()===t.getFullYear() })
}
function getDynamicStopWhites(today) {
  const byH = {}; today.filter(r=>r.color==='white').forEach(r=>{const h=new Date(r.time).getHours();byH[h]=(byH[h]||0)+1})
  const v = Object.values(byH); return v.length ? Math.max(4, Math.ceil(v.reduce((a,b)=>a+b,0)/v.length*1.5)) : 8
}
function getDynamicStopSignals(today) { return Math.max(3, getDynamicStopWhites(today)+1) }
function whitesThisHour(today) { const h=new Date().getHours(); return today.filter(r=>new Date(r.time).getHours()===h&&r.color==='white').length }
function signalsThisHour(signals) { const n=new Date(); return signals.filter(s=>{const t=new Date(s.created_at);return t.getHours()===n.getHours()&&t.getDate()===n.getDate()}).length }
function pillar1(today) {
  const counts={}; for(let i=1;i<today.length;i++){if(today[i].color==='white'){const p=today[i-1].num;counts[p]=(counts[p]||0)+1}}
  if(!Object.keys(counts).length) return {numbers:[],valid:false}
  const max=Math.max(...Object.values(counts))
  const sorted=Object.entries(counts).filter(([,c])=>c>=Math.max(2,Math.floor(max*0.5))).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,c])=>({num:parseInt(n),count:c}))
  return {numbers:sorted,valid:sorted.length>0}
}
function pillar2(today, triggerNum) {
  const ws=Math.min(50,Math.max(10,Math.floor(today.length*0.1))); const intervals=[]
  for(let i=0;i<today.length-1;i++){if(today[i].num===triggerNum){for(let j=i+1;j<Math.min(i+ws,today.length);j++){if(today[j].color==='white'){intervals.push((new Date(today[j].time)-new Date(today[i].time))/60000);break;}}}}
  if(intervals.length<2) return {avg:0,consistency:0,valid:false}
  const avg=intervals.reduce((a,b)=>a+b,0)/intervals.length
  const within=intervals.filter(x=>Math.abs(x-avg)<=2).length
  return {avg:Math.max(1,Math.round(avg)),consistency:Math.round(within/intervals.length*100),valid:within/intervals.length>=0.6}
}
function pillar3(today) {
  const m={}; today.forEach(r=>{if(r.color==='white'){const mn=new Date(r.time).getMinutes();m[mn]=(m[mn]||0)+1}})
  if(!Object.keys(m).length) return {minutes:[],valid:false}
  const max=Math.max(...Object.values(m))
  const hot=Object.entries(m).filter(([,c])=>c>=Math.max(2,Math.floor(max*0.4))).sort((a,b)=>b[1]-a[1]).map(([mn,c])=>({min:parseInt(mn),count:c}))
  return {minutes:hot,valid:hot.length>0}
}
function pillar4(today) {
  const whites=today.filter(r=>r.color==='white').slice(-6); if(whites.length<3) return {detected:false}
  const gaps=[]; for(let i=1;i<whites.length;i++) gaps.push((new Date(whites[i].time)-new Date(whites[i-1].time))/60000)
  const avg=gaps.slice(-3).reduce((a,b)=>a+b,0)/3
  return avg>=7&&avg<=15 ? {detected:true,gap:Math.round(avg)} : {detected:false}
}
function pillar5(today, targetMin) {
  const now=new Date(); const pv=new Date(now); pv.setHours(now.getHours()-1); pv.setMinutes(targetMin)
  const w=today.filter(r=>Math.abs(new Date(r.time)-pv)<180000)
  const hasFalse=w.some(r=>r.num===4||r.num===11)
  return {detected:hasFalse,boost:hasFalse?15:0}
}

// WIN window: ±1 min
export function getSigWindow(timeStr) {
  const [h,m] = timeStr.split(':').map(Number)
  const base  = new Date(); base.setHours(h,m,0,0)
  return { startW: new Date(base.getTime()-60000), endW: new Date(base.getTime()+60000) }
}
