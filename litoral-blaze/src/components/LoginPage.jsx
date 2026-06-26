import { useState } from 'react'
import { toast } from './Toast'

export default function LoginPage({ onLogin }) {
  const [tab, setTab]         = useState('login')
  const [adminMode, setAdmin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState('')

  // Login fields
  const [lEmail, setLEmail] = useState('')
  const [lPass,  setLPass]  = useState('')

  // Register fields
  const [rUser,  setRUser]  = useState('')
  const [rEmail, setREmail] = useState('')
  const [rPass,  setRPass]  = useState('')
  const [rPass2, setRPass2] = useState('')

  const ADMIN_PASS = import.meta.env.VITE_ADMIN_PASS || 'admin123'

  async function handleLogin(e) {
    e.preventDefault()
    setErr('')
    if (!lEmail || !lPass) { setErr('Preencha todos os campos'); return }

    if (adminMode) {
      if (lPass === ADMIN_PASS) { onLogin('admin'); toast('Bem-vindo, Admin! 👑', 'success') }
      else setErr('Senha admin incorreta')
      return
    }

    setLoading(true)
    const res = await onLogin('user', lEmail, lPass)
    setLoading(false)
    if (!res.ok) setErr(res.error || 'Credenciais inválidas')
  }

  async function handleRegister(e) {
    e.preventDefault()
    setErr('')
    if (!rUser || !rEmail || !rPass || !rPass2) { setErr('Preencha todos os campos'); return }
    if (rPass !== rPass2) { setErr('As senhas não coincidem'); return }
    if (rUser.length < 3) { setErr('Usuário deve ter ao menos 3 caracteres'); return }

    setLoading(true)
    const res = await onLogin('register', rEmail, rPass, rUser)
    setLoading(false)
    if (!res.ok) setErr(res.error || 'Erro ao criar conta')
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="l-logo">
          <img src="/logo.png" alt="Logo" onError={e=>e.target.style.display='none'} />
        </div>
        <div className="l-title">LITORAL <span>BLAZE</span></div>
        <div className="l-sub">{adminMode ? 'ADMIN ACCESS' : '14X — SIGNALS'}</div>

        {!adminMode && (
          <div className="l-tabs">
            <button className={`l-tab ${tab==='login'?'active':''}`} onClick={()=>{setTab('login');setErr('')}}>ENTRAR</button>
            <button className={`l-tab ${tab==='register'?'active':''}`} onClick={()=>{setTab('register');setErr('')}}>CADASTRAR</button>
          </div>
        )}

        {/* LOGIN */}
        {(tab === 'login' || adminMode) && (
          <form onSubmit={handleLogin}>
            <div className="ig">
              <i className="fas fa-envelope"></i>
              <input type={adminMode?'text':'email'} placeholder={adminMode?'admin':'Seu e-mail'} value={lEmail} onChange={e=>setLEmail(e.target.value)} autoComplete="off" />
            </div>
            <div className="ig">
              <i className="fas fa-lock"></i>
              <input type="password" placeholder="Senha" value={lPass} onChange={e=>setLPass(e.target.value)} />
            </div>
            {err && <div className="l-err">{err}</div>}
            <button className="btn-primary" disabled={loading}>{loading ? 'AGUARDE...' : 'ENTRAR'}</button>
            <div className="l-foot">
              <button type="button" onClick={()=>{setAdmin(!adminMode);setErr('')}}>
                {adminMode ? '← Voltar' : 'Acesso Admin'}
              </button>
            </div>
          </form>
        )}

        {/* REGISTER */}
        {tab === 'register' && !adminMode && (
          <form onSubmit={handleRegister}>
            <div className="ig">
              <i className="fas fa-user"></i>
              <input type="text" placeholder="Escolha um usuário" value={rUser} onChange={e=>setRUser(e.target.value)} autoComplete="off" />
            </div>
            <div className="ig">
              <i className="fas fa-envelope"></i>
              <input type="email" placeholder="Seu e-mail" value={rEmail} onChange={e=>setREmail(e.target.value)} />
            </div>
            <div className="ig">
              <i className="fas fa-lock"></i>
              <input type="password" placeholder="Crie uma senha" value={rPass} onChange={e=>setRPass(e.target.value)} />
            </div>
            <div className="ig">
              <i className="fas fa-lock"></i>
              <input type="password" placeholder="Repita a senha" value={rPass2} onChange={e=>setRPass2(e.target.value)} />
            </div>
            {err && <div className="l-err">{err}</div>}

            <hr className="l-divider" />
            <PayBox />

            <button className="btn-primary" disabled={loading}>{loading ? 'AGUARDE...' : 'CADASTRAR'}</button>
            <div className="l-foot" style={{marginTop:'.7rem'}}>
              Conta criada como <strong>gratuita</strong> até aprovação do pagamento.
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export function PayBox() {
  function copy() {
    navigator.clipboard.writeText('48101649859').then(()=>toast('🔑 Chave PIX copiada!','success')).catch(()=>{})
  }
  function whatsapp() {
    window.open('https://wa.me/5512991876748?text=' + encodeURIComponent('Olá! Realizei o pagamento do LITORAL BLAZE 14X. Segue o comprovante:'), '_blank')
  }
  return (
    <div className="pay-box">
      <div className="pay-box-title"><i className="fas fa-check-circle"></i> Pagamento — Acesso 24h</div>
      <div className="pix-info">Pague via PIX e envie o comprovante para liberar seu acesso.</div>
      <div className="pix-key-box">
        <span className="pix-key">48101649859</span>
        <button type="button" className="btn-copy" onClick={copy}><i className="fas fa-copy"></i> Copiar</button>
      </div>
      <div className="pix-info"><strong>PicPay · Vinicius Amorim</strong><br/>Após pagar, envie o comprovante pelo WhatsApp.</div>
      <button type="button" className="btn-whatsapp" onClick={whatsapp}>
        <i className="fab fa-whatsapp"></i> ENVIAR COMPROVANTE
      </button>
    </div>
  )
}
