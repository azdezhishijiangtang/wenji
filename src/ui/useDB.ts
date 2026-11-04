import { useEffect, useState, useSyncExternalStore } from 'react'
import { getDB, getVersion, subscribe } from '../engine/store'

export function useDB() {
  useSyncExternalStore(subscribe, getVersion, getVersion)
  return getDB()
}

export function useNow(intervalMs = 60000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
