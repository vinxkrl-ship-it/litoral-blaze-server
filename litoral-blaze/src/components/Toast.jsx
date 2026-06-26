import { useState, useCallback, useEffect } from 'react'

let _addToast = null
export function toast(msg, type = 'info') { _addToast?.(msg, type) }

export default function ToastContainer() {
  const [toasts, setToasts] = useState([])

  const add = useCallback((msg, type) => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3800)
  }, [])

  useEffect(() => { _addToast = add }, [add])

  const icons = { success: 'check-circle', error: 'times-circle', info: 'info-circle' }
  return (
    <div className="toast-wrap">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          <i className={`fas fa-${icons[t.type]}`}></i> {t.msg}
        </div>
      ))}
    </div>
  )
}
