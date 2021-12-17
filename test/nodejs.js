const ava = require('ava')
const { makeRuntime } = require('./util/util.js')
const { join } = require('path')

ava('Exit code', async t => {
  const logs = []
  const runtime = makeRuntime(join('nodejs', 'exitcode.js'), {
    env: 'nodejs',
    globals: {
      console: {
        log: (...args) => logs.push(args)
      }
    }
  })
  let exitCode = undefined
  runtime.on('closed', _exitCode => { exitCode = _exitCode })
  await runtime.init()
  await runtime.run()
  await runtime.close()
  t.is(logs.length, 1)
  t.deepEqual(logs[0], ['yo'])
  t.is(exitCode, 1)
})

ava('No FS access', async t => {
  const logs = []
  const runtime = makeRuntime(join('nodejs', 'fs.js'), {
    env: 'nodejs',
    globals: {
      console: {
        log: (...args) => logs.push(args)
      }
    }
  })
  await runtime.init()
  await t.throwsAsync(() => runtime.run())
  t.is(logs.length, 0)
})

ava('Path module', async t => {
  const logs = []
  const runtime = makeRuntime(join('nodejs', 'path.js'), {
    env: 'nodejs',
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
  t.deepEqual(logs[0], ['/'])
  t.deepEqual(logs[1], ['foo/bar'])
})