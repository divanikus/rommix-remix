import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readPresentation, writePresentation } from './library-presentation.ts'
import { popRoute, pushRoute, reviseRoute, type Route } from './history.ts'

test('view preferences survive a new screen; invalid profile data has safe defaults', () => {
  let value: string | null = null
  const storage = {
    getItem: () => value,
    setItem: (_key: string, text: string) => {
      value = text
    }
  }
  writePresentation(storage, {
    layout: 'list',
    coverSize: 'large',
    groupBy: 'letter',
    sortDir: 'desc'
  })
  assert.deepEqual(readPresentation(storage), {
    layout: 'list',
    coverSize: 'large',
    groupBy: 'letter',
    sortDir: 'desc'
  })
  value = '{corrupt'
  assert.deepEqual(readPresentation(storage), {
    layout: 'grid',
    coverSize: 'medium',
    groupBy: 'none',
    sortDir: 'asc'
  })
  value = '{"layout":"list","coverSize":"giant"}'
  assert.deepEqual(readPresentation(storage), {
    layout: 'list',
    coverSize: 'medium',
    groupBy: 'none',
    sortDir: 'asc'
  })
  value = '{"layout":"list","coverSize":"compact","groupBy":"letter","sortDir":"desc"}'
  assert.deepEqual(readPresentation(storage), {
    layout: 'list',
    coverSize: 'small',
    groupBy: 'letter',
    sortDir: 'desc'
  })
  assert.doesNotThrow(() =>
    writePresentation(
      {
        setItem: () => {
          throw Error('Full')
        }
      },
      { layout: 'grid', coverSize: 'small', groupBy: 'none', sortDir: 'asc' }
    )
  )
})

test('system, filtered library, exact version and Back retain the originating selection', () => {
  const systems: Route = { name: 'systems', platformId: 9 }
  const library: Route = { name: 'library', view: { scope: 'all', search: '', platformId: 9 } }
  let route = pushRoute([systems], library)
  assert.deepEqual(route, [systems, library])
  const selected: Route = {
    name: 'library',
    view: {
      scope: 'downloaded',
      search: 'Contra',
      platformId: 9,
      romId: 10,
      versionId: 11,
      layout: 'list',
      held: 120
    }
  }
  route = reviseRoute(route, selected)
  route = pushRoute(route, { name: 'game', romId: 11 })
  assert.deepEqual(popRoute(route), [systems, selected])
  assert.deepEqual(popRoute(popRoute(route)), [systems])
  assert.deepEqual(pushRoute(route, { name: 'home' }), [{ name: 'home' }])
})
