const { CjsIsolate, EsmIsolate } = require('./lib/isolate.js')
const { AbstractConfineRuntime} = require('abstract-confine-runtime')
const path = require('path')

module.exports = class JsIsolateConfineRuntime extends AbstractConfineRuntime {
  constructor (opts) {
    super(opts)
    this.isolate = undefined
  }

  async init () {
    if (this.opts.path && !path.isAbsolute(this.opts.path)) {
      throw new Error('Path option must be an absolute path')
    }
    if (this.opts.module === 'esm') {
      this.isolate = new EsmIsolate(this.source.toString('utf-8'), {
        path: this.opts.path || '/tmp/script.js',
        env: this.opts.env,
        globals: this.opts.globals,
        disableImports: this.opts.esm?.disableImports
      })
    } else {
      this.isolate = new CjsIsolate(this.source.toString('utf-8'), {
        path: this.opts.path || '/tmp/script.js',
        env: this.opts.env,
        globals: this.opts.globals,
        requires: this.opts.cjs?.requires
      })
    }
    this.isolate.on('closed', () => {
      this.emit('closed', this.isolate.exitCode || 0)
    })
    await this.isolate.open()
  }

  async run () {
    try {
      await this.isolate.run()
    } catch (e) {
      if (e.message === 'Isolate was disposed during execution') {
        // caused by process.exit(), ignore
        return
      }
      throw e
    }
  }

  async close () {
    this.isolate.close()
  }

  describeAPI () {
    return this.isolate.describeAPI()
  }

  async handleAPICall (methodName, params) {
    return this.isolate.handleAPICall(methodName, params)
  }
}
