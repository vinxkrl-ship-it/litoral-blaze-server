import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Mapa de cor por número (Double Blaze: 0=branco, 1-7=vermelho, 8-14=preto)
export function getColor(num) {
  if (num === 0) return 'white'
  if (num >= 1 && num <= 7) return 'red'
  return 'black'
}

export default function useRounds() {
  const [rounds, setRounds]     = useState([])
  const [online, setOnline]     = useState(false)
  const [lastId, setLastId]     = useState(null)
  const lastIdRef               = useRef(null)
  const timerRef                = useRef(null)

  // Busca rodadas da nossa Supabase Edge Function (que faz scraping do bestblaze)
  const fetchRounds = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-rounds')
      if (error || !data?.rounds?.length) {
        setOnline(false)
        return
      }
      const newRounds = data.rounds
      const newLastId = newRounds[newRounds.length - 1]?.id

      if (newLastId !== lastIdRef.current) {
        lastIdRef.current = newLastId
        setLastId(newLastId)
        setRounds(newRounds)
        setOnline(true)
      } else {
        setOnline(true)
      }
    } catch {
      setOnline(false)
    }
  }, [])

  useEffect(() => {
    fetchRounds()
    timerRef.current = setInterval(fetchRounds, 3000)
    return () => clearInterval(timerRef.current)
  }, [fetchRounds])

  return { rounds, online, lastId, refetch: fetchRounds }
}
