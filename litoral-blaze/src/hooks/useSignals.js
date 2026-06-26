import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export default function useSignals() {
  const [signals, setSignals] = useState([])

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (data) setSignals(data)
  }, [])

  useEffect(() => {
    fetch()
    // Realtime subscription
    const sub = supabase
      .channel('signals-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signals' }, () => fetch())
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [fetch])

  const createSignal = async ({ time_str, protection, confidence, note, is_ai }) => {
    const { data, error } = await supabase.from('signals').insert({
      time_str, protection: protection || 6,
      confidence: confidence || 85,
      note: note || '', is_ai: !!is_ai,
      status: 'active'
    }).select().single()
    if (!error) await fetch()
    return { ok: !error, data, error }
  }

  const updateSignal = async (id, updates) => {
    await supabase.from('signals').update(updates).eq('id', id)
    await fetch()
  }

  const deleteSignal = async (id) => {
    await supabase.from('signals').delete().eq('id', id)
    await fetch()
  }

  const resetSignals = async (type) => {
    if (type === 'all' || type === 's') {
      await supabase.from('signals').delete().neq('id', 0)
    } else if (type === 'stats') {
      await supabase.from('signals').update({ status: 'expired' }).in('status', ['win', 'loss'])
    }
    await fetch()
  }

  return { signals, refetch: fetch, createSignal, updateSignal, deleteSignal, resetSignals }
}
