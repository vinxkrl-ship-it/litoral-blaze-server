import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getStats } from '../lib/ai'
import { toast } from './Toast'

export default function AdminApp({ rounds, online, signals, onLogout, onCreateSignal, onUpdateSignal, onDeleteSignal, onResetSignals }) {
  const [users,      setUsers]      = useState([])
  const [aiEnabled,  setAiEnabled]  = useState(true)
  const [search,     setSearch]     = useState('')
  const [aTime,      setATime]      = useState('')
  const [aProt,      setAProt]      = useState('6')
  const [aConf,      setAConf]      = useState('85')
  const stats = getStats(rounds, signals)

  useEffect(() => { fetchUsers(); fetchSettings() }, [])

  // Realtime users
  useEffect(() => {
    const sub = supabase.channel('profiles-changes')
      .on('postgres_changes', { event:'*', schema:'public', table:'profiles' }, () => fetchUsers())
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [])

  async function fetchUsers() {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (data) setUsers(data)
  }

  async function fetchSettings() {
    const { data } = await supabase.from('settings').select('value').eq('key','ai_enabled').single()
    if (data) setAiEnabled(data.value === 'true')
  }

  async function toggleAI() {
    const next = !aiEnabled
    setAiEnabled(next)
    await supabase.from('settings').upsert({ key:'ai_enabled', value: String(next) })
    toast(next ? 'IA ATIVADA 🤖' : 'IA DESATIVADA', 'info')
  }

  async function approveUser(id) {
    await supabase.from('profiles').update({ status:'active', approved_at: new Date().toISOString() }).eq('id', id)
    await fetchUsers()
    toast('✅ Pagamento aprovado! Acesso liberado.', 'success')
  }

  async function revokeUser(id, username) {
    if (!confirm(`Revogar acesso de ${username}?`)) return
    await supabase.from('profiles').update({ status:'free', approved_at: null }).eq('id', id)
    await fetchUsers()
    toast(`${username} teve acesso revogado`, 'info')
  }

  async function deleteUser(id, username) {
    if (!confirm(`Deletar ${username}?`)) return
    await supabase.from('profiles').delete().eq('id', id)
    // Deleta auth user via admin (só funciona com service key — skip aqui)
    await fetchUsers()
    toast('Usuário removido', 'info')
  }

  async function handleCreateSig(e) {
    e.preventDefault()
    if (!aTime) { toast('Defina o horário', 'error'); return }
    const res = await onCreateSignal({ time_str: aTime, protection: parseInt(aProt), confidence: parseInt(aConf), note: 'Manual', is_ai: false })
    if (res.ok) { setATime(''); toast('🔥 Sinal enviado!', 'success') }
    else toast(res.error || 'Erro ao criar sinal', 'error')
  }

  const filtered = search
    ? users.filter(u => u.username?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))
    : users

  const activeCount  = signals.filter(s=>s.status==='active').length
  const lastRound    = rounds[rounds.length-1]

  return (
    <div className="admin visible">
      <header className="header">
        <div className="h-logo">
          <img src="/logo.png" alt="Logo" onError={e=>e.target.style.display='none'} />
          <div className="t">ADMIN <span>PANEL</span></div>
        </div>
        <div className="h-right">
          <div className={`h-live ${online?'':'offline'}`}>
            <div className="dot"></div>
            <span>{online?'AO VIVO':'OFFLINE'}</span>
          </div>
          <button className="btn-icon" onClick={onLogout}><i className="fas fa-sign-out-alt"></i></button>
        </div>
      </header>

      <div className="admin-wrap">
        {/* Connection */}
        <div className={`conn-bar ${online?'ok':'err'}`}>
          <div className={`conn-dot ${online?'on':'off'}`}></div>
          <div style={{flex:1}}>
            <strong style={{fontSize:'.85rem',display:'block'}}>{online?'Sistema conectado':'Sem conexão com bestblaze'}</strong>
            <small style={{color:'var(--text-3)',fontSize:'.7rem'}}>{rounds.length} rodadas · {users.length} usuários · {activeCount} sinais ativos</small>
          </div>
          <button className="btn btn-s" onClick={()=>toast('Sincronizando...','info')}><i className="fas fa-sync"></i></button>
        </div>

        {/* AI Toggle */}
        <div style={{background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:'10px',padding:'.9rem 1.2rem',marginBottom:'1rem',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'.7rem'}}>
          <div style={{display:'flex',alignItems:'center',gap:'8px',fontWeight:600,fontSize:'.85rem'}}>
            <i className="fas fa-brain" style={{color:'var(--red)'}}></i> IA Automática (5 Pilares)
          </div>
          <div className={`toggle ${aiEnabled?'on':''}`} onClick={toggleAI}></div>
        </div>

        {/* AI Info */}
        <div className="ai-info-grid">
          {[['Rodadas Hoje', stats.total],['Brancos Hoje', stats.whites],['Média/Hora', stats.avgPerHour],['Top Gatilho', stats.topTrigger],['Limite Brancos/h', stats.stopWhites],['Limite Sinais/h', stats.stopSignals]].map(([l,v])=>(
            <div key={l} className="ai-card"><div className="l">{l}</div><div className="v">{v}</div></div>
          ))}
        </div>

        {/* Stats */}
        <div className="stats">
          <div className="stat w"><div className="stat-lbl"><i className="fas fa-trophy"></i> WINS</div><div className="stat-val">{stats.wins}</div></div>
          <div className="stat l"><div className="stat-lbl"><i className="fas fa-times"></i> LOSSES</div><div className="stat-val">{stats.losses}</div></div>
          <div className="stat r"><div className="stat-lbl"><i className="fas fa-percentage"></i> WIN RATE</div><div className="stat-val">{stats.rate}%</div></div>
          <div className="stat t"><div className="stat-lbl"><i className="fas fa-users"></i> USUÁRIOS</div><div className="stat-val">{users.length}</div></div>
        </div>

        <div className="admin-grid">
          {/* Sinal Manual */}
          <div className="card">
            <div className="card-h"><div className="card-t"><i className="fas fa-plus-circle"></i> Sinal Manual</div></div>
            <div className="card-b">
              <form onSubmit={handleCreateSig}>
                <div className="form-group"><label>Horário</label><input type="time" value={aTime} onChange={e=>setATime(e.target.value)} /></div>
                <div className="form-group"><label>Proteção</label>
                  <select value={aProt} onChange={e=>setAProt(e.target.value)}>
                    <option value="3">3 rodadas</option>
                    <option value="6">6 rodadas</option>
                    <option value="9">9 rodadas</option>
                  </select>
                </div>
                <div className="form-group"><label>Confiança (%)</label><input type="number" value={aConf} onChange={e=>setAConf(e.target.value)} min="50" max="100" /></div>
                <button className="btn btn-p" type="submit"><i className="fas fa-bolt"></i> ENVIAR SINAL</button>
              </form>
            </div>
          </div>

          {/* Lista de Sinais */}
          <div className="card">
            <div className="card-h"><div className="card-t"><i className="fas fa-list"></i> Sinais ({signals.length})</div></div>
            <div className="card-b" style={{maxHeight:300,overflowY:'auto'}}>
              {signals.length === 0 ? (
                <p style={{color:'var(--text-3)',textAlign:'center',padding:'1.5rem',fontSize:'.82rem'}}>Nenhum sinal</p>
              ) : signals.slice(0,30).map(sig => {
                let tagEl = null
                if(sig.status==='active')tagEl=<span className="sig-tag pending">ATIVO</span>
                else if(sig.status==='win')tagEl=<span className="sig-tag win">WIN</span>
                else if(sig.status==='loss')tagEl=<span className="sig-tag loss">LOSS</span>
                else tagEl=<span className="sig-tag" style={{opacity:.4}}>EXP</span>
                const canMark = sig.status==='active'||sig.status==='pending'
                return (
                  <div key={sig.id} className="aitem">
                    <div className="aitem-left">
                      <div className="sig-chip" style={{width:28,height:28,fontSize:'.5rem'}}>14X</div>
                      <div>
                        <strong style={{fontSize:'.82rem'}}>{sig.time_str}{sig.is_ai?' 🤖':''}</strong>
                        <br/><small style={{color:'var(--text-3)',fontSize:'.68rem'}}>{sig.confidence}%</small>
                      </div>
                    </div>
                    <div className="aitem-acts">
                      {tagEl}
                      {canMark && <>
                        <button className="btn btn-s" onClick={()=>onUpdateSignal(sig.id,{status:'win',result_time:new Date().toISOString()}).then(()=>toast('✅ WIN!','success'))}>W</button>
                        <button className="btn btn-d" onClick={()=>onUpdateSignal(sig.id,{status:'loss',result_time:new Date().toISOString()}).then(()=>toast('❌ LOSS','error'))}>L</button>
                      </>}
                      <button className="btn btn-d" onClick={()=>onDeleteSignal(sig.id).then(()=>toast('Removido','info'))}><i className="fas fa-trash"></i></button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Usuários */}
          <div className="card" style={{gridColumn:'1/-1'}}>
            <div className="card-h"><div className="card-t"><i className="fas fa-users-cog"></i> Gerenciar Usuários ({users.length})</div></div>
            <div className="card-b">
              <div className="search-wrap">
                <i className="fas fa-search"></i>
                <input className="search-input" placeholder="Buscar por usuário ou email..." value={search} onChange={e=>setSearch(e.target.value)} />
              </div>
              {filtered.length === 0 ? (
                <p style={{color:'var(--text-3)',fontSize:'.75rem',textAlign:'center',padding:'.8rem'}}>Nenhum usuário encontrado</p>
              ) : filtered.map(u => (
                <div key={u.id} className="aitem">
                  <div className="aitem-left">
                    <div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,var(--red),#ff6b7e)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.68rem',fontWeight:700,flexShrink:0}}>
                      {(u.username||'?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <strong style={{fontSize:'.82rem'}}>{u.username}</strong>
                      <br/><small style={{color:'var(--text-3)',fontSize:'.65rem'}}>{u.email} · {u.created_at?new Date(u.created_at).toLocaleDateString('pt-BR'):'—'}</small>
                    </div>
                  </div>
                  <div className="aitem-acts">
                    <span className={`user-badge ${u.status==='active'?'active':'pending'}`}>{u.status==='active'?'ATIVO':'PENDENTE'}</span>
                    {u.status!=='active'
                      ? <button className="btn btn-s" onClick={()=>approveUser(u.id)} title="Aprovar pagamento"><i className="fas fa-check"></i></button>
                      : <button className="btn btn-d" onClick={()=>revokeUser(u.id,u.username)} title="Revogar"><i className="fas fa-ban"></i></button>
                    }
                    <button className="btn btn-d" onClick={()=>deleteUser(u.id,u.username)}><i className="fas fa-user-minus"></i></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="danger-zone">
          <div className="card-h"><div className="card-t" style={{color:'var(--red)'}}><i className="fas fa-exclamation-triangle"></i> Zona de Perigo</div></div>
          <div className="card-b" style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button className="btn btn-d" onClick={()=>onResetSignals('s').then(()=>toast('Sinais limpos','info'))}><i className="fas fa-trash"></i> Limpar Sinais</button>
            <button className="btn btn-d" onClick={()=>onResetSignals('stats').then(()=>toast('Stats resetadas','info'))}><i className="fas fa-chart-bar"></i> Resetar Stats</button>
            <button className="btn btn-d" onClick={()=>{ if(confirm('RESET TOTAL?')) onResetSignals('all').then(()=>toast('Reset total feito','info')) }}><i className="fas fa-bomb"></i> RESET TOTAL</button>
          </div>
        </div>

        <div className="footer">
          <img src="/logo.png" alt="" onError={e=>e.target.style.display='none'}/>
          <p>⚡ <span style={{color:'var(--red)',fontWeight:600}}>LITORAL BLAZE 14X</span> · ADMIN</p>
        </div>
      </div>
    </div>
  )
}
