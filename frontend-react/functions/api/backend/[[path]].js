const BACKEND_ORIGIN = 'https://cachyos-x8664.tailff30fd.ts.net'

export async function onRequest({ request }) {
  const origin = request.headers.get('Origin')
  if (origin && origin !== new URL(request.url).origin) {
    return new Response('Forbidden', { status: 403 })
  }

  const requestUrl = new URL(request.url)
  const path = requestUrl.pathname.slice('/api/backend'.length).replace(/^\/+/, '')
  const target = new URL(path, `${BACKEND_ORIGIN}/`)
  target.search = requestUrl.search

  const headers = new Headers(request.headers)
  for (const header of [
    'host', 'origin', 'referer', 'cookie', 'content-length',
    'connection', 'transfer-encoding', 'accept-encoding',
  ]) {
    headers.delete(header)
  }

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method)
        ? undefined
        : await request.arrayBuffer(),
    })
    const responseHeaders = new Headers(upstream.headers)
    responseHeaders.delete('content-length')
    responseHeaders.delete('content-encoding')
    responseHeaders.delete('transfer-encoding')
    responseHeaders.set('Cache-Control', 'no-store')

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error('Backend proxy failed:', error)
    return Response.json({ detail: 'Backend service is unavailable' }, { status: 502 })
  }
}
