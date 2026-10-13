import { useCallback, useEffect, useState } from 'react'
import { ensureSession, getInfo, getStatus, resetSession } from './phoneLink'

const STATUS_MS = 2000
const INFO_EVERY = 4 // refresh the computer's network addresses every 4th status check (a phone may have just been tethered)

/**
 * Keeps the pairing token, this computer's addresses and both phones' status up to date for the setup card.
 * `available` is null while checking, false when the phone gateway is not running (for example a hosted build).
 */
export function usePhoneLink(patientId, { enabled = true } = {}) {
  const [available, setAvailable] = useState(null)
  const [info, setInfo] = useState(null)
  const [token, setToken] = useState(null)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    if (!enabled || !patientId) return undefined
    let cancelled = false
    let tick = 0
    ;(async () => {
      const [nextInfo, session] = await Promise.all([getInfo(), ensureSession(patientId)])
      if (cancelled) return
      setAvailable(Boolean(nextInfo && session))
      setInfo(nextInfo)
      if (session) { setToken(session.token); setStatus(session.status) }
    })()
    const timer = setInterval(async () => {
      tick += 1
      const [next, nextInfo] = await Promise.all([getStatus(patientId), tick % INFO_EVERY === 0 ? getInfo() : null])
      if (cancelled) return
      if (next) setStatus(next)
      if (nextInfo) setInfo(nextInfo)
    }, STATUS_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [patientId, enabled])

  /** New pairing: the old links and QR codes stop working at once. */
  const reset = useCallback(async () => {
    const session = await resetSession(patientId)
    if (session) { setToken(session.token); setStatus(session.status) }
  }, [patientId])

  return { available, info, token, status, reset }
}
