import { useState, useEffect } from 'react'
import useAuth    from './hooks/useAuth'
import useRounds  from './hooks/useRounds'
import useSignals from './hooks/useSignals'
import LoginPage  from './components/LoginPage'
import UserApp    from './components/UserApp'
import AdminApp   from './components/AdminApp'
import ToastContainer, { toast } from './components/Toast'

export default function App() {
  const { user, profile, loading, isAdmin, login, register, logout } = useAuth()
  const { rounds, online } = useRounds()
  const { signals, createSignal, updateSignal, deleteSignal, resetSignals } = useSignals()
  const [adminSession, setAdminSession] = useState(() => localStorage.getItem('lb_admin') === '1')
  const [installPrompt, setInstallPrompt] = useState(null)
  const [showBanner,    setShowBanner]    = useState(false)

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault(); setInstallPrompt(e)
      setTimeout(() => setShowBanner(true), 3000)
    })
  }, [])

  async function handleInstall() {
    if (!installPrompt) return
    installPrompt.prompt(); await installPrompt.userChoice
    setInstallPrompt(null); setShowBanner(false)
  }

  async function handleLogin(type, arg1, arg2, arg3) {
    if (type === 'admin') {
      // arg1 = entered password, VITE_ADMIN_PASS checked in LoginPage
      localStorage.setItem('lb_admin', '1')
      setAdminSession(true)
      toast('Bem-vindo, Admin! 👑', 'success')
      return { ok: true }
    }
    if (type === 'register') {
      const res = await register(arg1, arg2, arg3)
      if (res.ok) toast(`Conta criada! Bem-vindo, ${arg3} 🔥`, 'success')
      return res
    }
    // type === 'user'
    const res = await login(arg1, arg2)
    if (res.ok) toast('Bem-vindo de volta! 🔥', 'success')
    return res
  }

  function handleLogout() {
    logout()
    localStorage.removeItem('lb_admin')
    setAdminSession(false)
    toast('Até logo! 👋', 'info')
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="load-logo">
          <img src="/logo.png" alt="Logo" onError={e=>e.target.style.display='none'} />
          <div className="t">LITORAL <span>BLAZE</span> 14X</div>
        </div>
        <div className="load-bar"><div className="load-bar-fill"></div></div>
        <div className="load-status">Inicializando sistema...</div>
      </div>
    )
  }

  const showAdmin = adminSession || isAdmin
  const showUser  = !showAdmin && !!user

  return (
    <>
      <ToastContainer />

      {!user && !adminSession && <LoginPage onLogin={handleLogin} />}

      {showUser && (
        <UserApp
          profile={profile}
          rounds={rounds}
          online={online}
          signals={signals}
          onLogout={handleLogout}
          onUpdateSignal={updateSignal}
        />
      )}

      {showAdmin && (
        <AdminApp
          rounds={rounds}
          online={online}
          signals={signals}
          onLogout={handleLogout}
          onCreateSignal={createSignal}
          onUpdateSignal={updateSignal}
          onDeleteSignal={deleteSignal}
          onResetSignals={resetSignals}
        />
      )}

      {showBanner && (
        <div className="install-banner show">
          <img src="/logo.png" alt="Logo" style={{width:44,height:44,borderRadius:12,objectFit:'contain'}} onError={e=>e.target.style.display='none'} />
          <div style={{flex:1}}>
            <strong style={{display:'block',fontSize:'.88rem',fontWeight:700,marginBottom:2}}>Instalar LITORAL BLAZE</strong>
            <span style={{fontSize:'.72rem',color:'var(--text-2)'}}>Adicione à tela inicial para acesso rápido</span>
          </div>
          <button style={{background:'linear-gradient(135deg,var(--red),var(--red-2))',color:'#fff',border:'none',padding:'8px 16px',borderRadius:10,fontWeight:700,fontSize:'.75rem',cursor:'pointer'}} onClick={handleInstall}>INSTALAR</button>
          <button style={{width:28,height:28,background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:'50%',color:'var(--text-3)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.7rem'}} onClick={()=>setShowBanner(false)}>✕</button>
        </div>
      )}
    </>
  )
}
