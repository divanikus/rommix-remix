import assert from 'node:assert/strict'
import { test } from 'node:test'
import { romResourcePath } from './romm-resource.ts'

test('scraped resources accept server-relative and already rooted asset paths', () => {
  assert.equal(romResourcePath('roms/1/2/video.mp4'), '/assets/romm/resources/roms/1/2/video.mp4')
  assert.equal(
    romResourcePath('/assets/romm/resources/roms/1/2/fanart.jpg'),
    '/assets/romm/resources/roms/1/2/fanart.jpg'
  )
})
test('resource normalization never broadens the authenticated asset boundary', () => {
  for (const path of [
    null,
    '',
    'https://external.example/video.mp4',
    '//external/video.mp4',
    '/api/users',
    'roms/../../api',
    'roms/%2e%2e/api',
    'roms/%5capi',
    'roms/a?redirect=1',
    'roms/a?ts=123&redirect=1',
    'roms/a?ts=123&ts=456',
    'roms/a?ts=',
    'roms/a?ts=123#fragment',
    'roms/%2e%2e/api?ts=123',
    'https://external.example/cover.png?ts=123',
    'roms/%zz'
  ])
    assert.equal(romResourcePath(path), null)
})

test('RomM cover cache timestamps do not become part of the asset filename', () => {
  const path = '/assets/romm/resources/roms/1/2/cover/big.png'
  assert.equal(romResourcePath(path + '?ts=2026-01-02 03:04:05.123456+00:00'), path)
  assert.equal(romResourcePath(path + '?ts=2026-01-02T03%3A04%3A05%2B00%3A00'), path)
  assert.equal(romResourcePath('roms/1/2/cover/big.png?ts=123'), path)
})
