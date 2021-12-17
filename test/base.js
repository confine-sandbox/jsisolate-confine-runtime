const ava = require('ava')
const { makeRuntime } = require('./util/util.js')

ava('Basic', async t => {
  const logs = []
  const errors = []
  const runtime = makeRuntime('basic.js', {
    globals: {
      console: {
        log: (...args) => logs.push(args),
        error: (...args) => errors.push(args)
      }
    }
  })
  await runtime.init()
  await runtime.run()
  await runtime.close()
  t.is(logs.length, 1)
  t.is(logs[0][0], 'hello, world')
  t.is(errors.length, 1)
  t.is(errors[0][0], 'hello, error')
})

ava('Globals', async t => {
  const calls = []
  const runtime = makeRuntime('globals.js', {
    globals: {
      console: {
        log: (...args) => calls.push(['console.log', args]),
        error: (...args) => calls.push(['console.error', args])
      },
      stupidGlobal: (...args) => calls.push(['stupidGlobal', args]),
      deeply: {
        nested: {
          stupid: {
            global: (...args) => calls.push(['deeply.nested.stupid.global', args])
          }
        }
      }
    }
  })
  await runtime.init()
  await runtime.run()
  await runtime.close()
  t.is(calls.length, 4)
  t.is(calls[0][0], 'console.log')
  t.is(calls[0][1][0], 'hello world!')
  t.is(calls[1][0], 'console.error')
  t.is(calls[1][1][0], 'hello')
  t.is(calls[1][1][1], 'error!')
  t.is(calls[1][1][2], 100)
  t.is(calls[2][0], 'stupidGlobal')
  t.is(calls[3][0], 'deeply.nested.stupid.global')
})
