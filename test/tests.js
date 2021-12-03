const ava = require('ava')
const {join} = require('path')
const JsIsolateConfineRuntime = require('../index.js')

ava('Basic', async t => {
  const runtime = new JsIsolateConfineRuntime(join(__dirname, 'programs', 'basic.js'))
  await runtime.init()
  await runtime.run()
  t.pass()
})

ava('No FS access', async t => {
  const runtime = new JsIsolateConfineRuntime(join(__dirname, 'programs', 'no-fs.js'))
  await runtime.init()
  await t.throwsAsync(() => runtime.run())
})
