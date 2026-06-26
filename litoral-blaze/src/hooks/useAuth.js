import { useState, useEffect } from 'react'
import { supabase, signUp, signIn, signOut, getProfile } from '../lib/supabase'

export default function useAuth() {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        getProfile(session.user.id).then(p => { setProfile(p); setLoading(false) })
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user)
        const p = await getProfile(session.user.id)
        setProfile(p)
      } else {
        setUser(null)
        setProfile(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const refreshProfile = async () => {
    if (user) {
      const p = await getProfile(user.id)
      setProfile(p)
      return p
    }
  }

  const login = async (email, password) => {
    const res = await signIn(email, password)
    if (res.ok) {
      const p = await getProfile(res.user.id)
      setProfile(p)
    }
    return res
  }

  const register = async (email, password, username) => {
    return await signUp(email, password, username)
  }

  const logout = async () => {
    await signOut()
    setUser(null)
    setProfile(null)
  }

  const isAdmin = profile?.role === 'admin'
  const isPaid  = profile?.status === 'active' || isAdmin

  return { user, profile, loading, isAdmin, isPaid, login, register, logout, refreshProfile }
}
