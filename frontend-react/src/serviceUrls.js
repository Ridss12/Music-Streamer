const trimTrailingSlashes = value => value.trim().replace(/\/+$/, '')

export const IS_LOCAL_FRONTEND = (() => {
  const hostname = window.location.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1'
})()
const IS_TAILSCALE_FRONTEND = window.location.hostname.endsWith('.ts.net')

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim()

export const DEFAULT_API_BASE = IS_LOCAL_FRONTEND
  ? configuredApiBase
    ? trimTrailingSlashes(configuredApiBase)
    : 'http://localhost:8000'
  : IS_TAILSCALE_FRONTEND
    ? window.location.origin
  : window.location.protocol === 'https:'
    ? `${window.location.origin}/api/backend`
    : `http://${window.location.hostname}:8000`

const serviceBase = (envValue, localUrl) => {
  if (IS_LOCAL_FRONTEND && envValue?.trim()) return trimTrailingSlashes(envValue)
  return IS_LOCAL_FRONTEND ? localUrl : ''
}

const whisperBase = serviceBase(
  import.meta.env.VITE_WHISPER_BASE_URL,
  'http://127.0.0.1:8001'
)
export const WHISPER_TRANSCRIBE_URL = IS_LOCAL_FRONTEND
  ? `${whisperBase}/transcribe`
  : IS_TAILSCALE_FRONTEND
    ? `${window.location.origin}/whisper/transcribe`
    : `${window.location.origin}/api/whisper/transcribe`
