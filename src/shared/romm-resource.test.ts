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
    'roms/%zz'
  ])
    assert.equal(romResourcePath(path), null)
})
