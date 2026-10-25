const trimTrailingSlashes = value => value.trim().replace(/\/+$/, '')

const isLocalFrontend = () => {
  const hostname = window.location.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim()

export const DEFAULT_API_BASE = configuredApiBase
  ? trimTrailingSlashes(configuredApiBase)
  : isLocalFrontend()
    ? 'http://localhost:8000'
    : window.location.protocol === 'https:'
      ? ''
      : `http://${window.location.hostname}:8000`

const serviceBase = (envValue, localUrl) => {
  if (envValue?.trim()) return trimTrailingSlashes(envValue)
  return isLocalFrontend() ? localUrl : ''
}

const whisperBase = serviceBase(
  import.meta.env.VITE_WHISPER_BASE_URL,
  'http://127.0.0.1:8001'
)
export const WHISPER_TRANSCRIBE_URL = isLocalFrontend()
  ? `${whisperBase}/transcribe`
  : `${window.location.origin}/api/whisper/transcribe`
