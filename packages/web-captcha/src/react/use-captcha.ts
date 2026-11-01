import { useCallback, useEffect, useRef, useState } from 'react'
import { CaptchaLoadError } from '../errors.js'
import { captchaLoader } from '../loader.js'
import type { CaptchaLoadErrorReason } from '../types.js'
import type { UseCaptchaOptions, UseCaptchaResult } from './types.js'

const errorOf = (failure: unknown, reason: CaptchaLoadErrorReason): Error =>
  failure instanceof Error ? failure : new CaptchaLoadError(reason, String(failure))

/**
 * reCAPTCHA v3 for one form: starts loading the script as soon as a site key is known and gives a
 * fresh token per submit. With no site key the captcha is off — `ready` is true and `execute`
 * resolves `null`, so the form sends no captcha at all.
 */
export const useCaptcha = ({ siteKey, action, loader = captchaLoader }: UseCaptchaOptions): UseCaptchaResult => {
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
    let current = true
    setReady(false)
    loader.prepare(key).then(
      () => { if (current) { setReady(true) } },
      (failure: unknown) => { if (current) { setError(errorOf(failure, 'load')) } }
    )

    return () => { current = false }
  }, [key, loader])

  const execute = useCallback(async (): Promise<string | null> => {
    if (key == null) {
      return null
    }
    try {
      const token = await loader.token(key, action)
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
  }, [key, action, loader])

  return { ready, error, execute }
}
