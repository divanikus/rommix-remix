/** Forward range semantics without buffering video or exposing upstream headers. */
export async function mediaResponse(
  request: Request,
  fetchAsset: (options: RequestInit) => Promise<Response>
): Promise<Response> {
  const range = request.headers.get('range')
  if (range && !/^bytes=\d*-\d*$/.test(range)) return new Response(null, { status: 416 })
  const upstream = await fetchAsset({
    signal: request.signal,
    headers: range ? { Range: range } : {}
  })
  const headers = new Headers({ 'Cache-Control': 'private, no-store' })
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = upstream.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  if (![200, 206, 416].includes(upstream.status)) {
    await upstream.body?.cancel().catch(() => undefined)
    return new Response(null, { status: upstream.status })
  }
  return new Response(upstream.body, { status: upstream.status, headers })
}
