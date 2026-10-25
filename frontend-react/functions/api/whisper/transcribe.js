const WHISPER_UPSTREAM_URL = 'https://cachyos-x8664.tailff30fd.ts.net/whisper/transcribe'
const PAGES_ORIGIN = 'https://music-streamer.pages.dev'

export async function onRequest({ request }) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'POST' },
    })
  }

  const origin = request.headers.get('Origin')
  if (origin && origin !== PAGES_ORIGIN) {
    return new Response('Forbidden', { status: 403 })
  }

  const contentType = request.headers.get('Content-Type') || ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
    return new Response('Expected multipart audio upload', { status: 400 })
  }

  try {
    const upstream = await fetch(WHISPER_UPSTREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: await request.arrayBuffer(),
    })

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Whisper proxy failed:', error)
    return new Response('Whisper service is unavailable', { status: 502 })
  }
}
