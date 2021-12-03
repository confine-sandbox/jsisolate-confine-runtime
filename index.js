const ModuleSandbox = require('module-sandbox')
const AbstractConfineRuntime = require('abstract-confine-runtime')

module.exports = class JsIsolateConfineRuntime extends AbstractConfineRuntime {
  constructor (sourcePath, opts) {
    super(sourcePath, opts)
    this.isolate = undefined
  }

  async init () {
    this.isolate = new ModuleSandbox(this.sourcePath)
    await this.isolate.open()
  }

  async run () {
    await this.isolate.run()
  }

  async close () {
  }
}
