import { useCallback, useEffect, useRef, useState } from 'react'
import { CaptchaLoadError } from '../errors.js'
import type { CaptchaLoadErrorReason } from '../types.js'
import type { UseCaptchaOptions, UseCaptchaResult } from './types.js'

const errorOf = (failure: unknown, reason: CaptchaLoadErrorReason): Error =>
  failure instanceof Error ? failure : new CaptchaLoadError(reason, String(failure))

const missing = (): CaptchaLoadError => new CaptchaLoadError('unavailable', 'No captcha client for the advertised provider')

/**
 * One form's captcha: starts loading the provider as soon as a site key is known and gives a fresh
 * token per submit. With no site key the captcha is off — `ready` is true and `execute` resolves
 * `null`, so the form sends no captcha at all. A site key without a client for its provider fails
 * closed: never ready, and `execute` throws `CaptchaLoadError('unavailable')`.
 */
export const useCaptcha = ({ client, siteKey, action }: UseCaptchaOptions): UseCaptchaResult => {
  const key = siteKey != null && siteKey !== '' ? siteKey : null
  const [ready, setReady] = useState<boolean>(key == null)
  const [error, setError] = useState<Error | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    setError(null)
    if (key == null) {
      setReady(true)
      return
    }
    setReady(false)
    if (client == null) {
      setError(missing())
      return
    }
    let current = true
    client.load(key).then(
      () => { if (current) { setReady(true) } },
      (failure: unknown) => { if (current) { setError(errorOf(failure, 'load')) } }
    )

    return () => { current = false }
  }, [key, client])

  const execute = useCallback(async (): Promise<string | null> => {
    if (key == null) {
      return null
    }
    try {
      if (client == null) {
        throw missing()
      }
      const token = await client.execute(key, action)
      if (mounted.current) {
        setReady(true)
        setError(null)
      }
      return token
    } catch (failure) {
      const reported = errorOf(failure, 'execute')
      if (mounted.current) {
        setError(reported)
      }
      throw reported
    }
  }, [key, action, client])

  return { ready, error, execute }
}
