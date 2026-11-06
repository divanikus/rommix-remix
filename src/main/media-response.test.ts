import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mediaResponse } from './media-response.ts'

test('video streams partial responses, forwards cancellation and preserves seek headers', async () => {
  const request = new Request('https://local/video', { headers: { Range: 'bytes=12-15' } })
  const response = await mediaResponse(request, async (init) => {
    assert.equal(new Headers(init.headers).get('range'), 'bytes=12-15')
    assert.equal(init.signal, request.signal)
    return new Response('data', {
      status: 206,
      headers: {
        'Content-Range': 'bytes 12-15/30',
        'Content-Length': '4',
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Set-Cookie': 'private'
      }
    })
  })
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('content-range'), 'bytes 12-15/30')
  assert.equal(response.headers.get('content-length'), '4')
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(await response.text(), 'data')
})

test('range failure stays a range failure and malformed ranges are not fetched', async () => {
  const request = new Request('https://local/video')
  const response = await mediaResponse(
    request,
    async () => new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */20' } })
  )
  assert.equal(response.status, 416)
  assert.equal(response.headers.get('content-range'), 'bytes */20')
  const refused = await mediaResponse(
    new Request(request, { headers: { Range: 'bytes=1-2,4-6' } }),
    async () => {
      throw Error('must not fetch')
    }
  )
  assert.equal(refused.status, 416)
})

test('failed media cancels unread bodies rather than retaining connections', async () => {
  let cancelled = false
  const response = await mediaResponse(
    new Request('https://local/video'),
    async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true
          }
        }),
        { status: 404 }
      )
  )
  assert.equal(response.status, 404)
  assert.equal(cancelled, true)
})
