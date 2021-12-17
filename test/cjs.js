const ava = require('ava')
const { makeRuntime } = require('./util/util.js')
const { join } = require('path')

ava('Simple requires', async t => {
  const logs = []
  const runtime = makeRuntime(join('cjs', 'simple', 'index.js'), {
    globals: {
      console: {
        log: (...args) => logs.push(args)
      }
    }
  })
  await runtime.init()
  await runtime.run()
  await runtime.close()
  t.is(logs.length, 2)
  t.deepEqual(logs[0], ['add result:', 3])
  t.deepEqual(logs[1], ['mult result:', 2])
})

ava('Simple exports', async t => {
  const runtime = makeRuntime(join('cjs', 'simple-exports', 'index.js'))
  await runtime.init()
  await runtime.run()
  t.deepEqual(sortAPI(JSON.parse(JSON.stringify(runtime.describeAPI()))), {
    type: 'api',
    children: [
      {type: 'method', name: 'add'},
      {type: 'object', name: 'arrays', children: [
        {type: 'method', name: 'double'},
      ]},
      {type: 'method', name: 'mult'},
      {type: 'object', name: 'objects', children: [
        {type: 'method', name: 'greet'},
      ]}
    ]
  })
  t.is(await runtime.handleAPICall('add', [1, 2]), 3)
  t.is(await runtime.handleAPICall('mult', [3, 4]), 12)
  t.is(await runtime.handleAPICall('mult', [3, 4, 2]), 24)
  t.is(await runtime.handleAPICall('add', [3, 2, 10]), 15)
  t.deepEqual(await runtime.handleAPICall('arrays.double', [[1, 2, 3, 4]]), [2, 4, 6, 8])
  t.deepEqual(await runtime.handleAPICall('objects.greet', [{ name: 'tester' }]), { hello: 'tester and world' })
  await runtime.close()
})

ava('Require overrides', async t => {
  const runtime = makeRuntime(join('cjs', 'require-overrides', 'index.js'), {
    requires: {
      'other-module': join(__dirname, 'programs', 'cjs', 'require-overrides', 'other.js')
    }
  })
  await runtime.init()
  await runtime.run()
  t.is(await runtime.handleAPICall('hello'), 'hello world')
  await runtime.close()
})

function sortAPI (v) {
  if (v.children) {
    v.children = v.children.sort((a, b) => a.name.localeCompare(b.name))
    for (const item of v.children) {
      if (item.type === 'object') {
        sortAPI(item)
      }
    }
  }
  return v
}