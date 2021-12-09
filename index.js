const ModuleSandbox = require('module-sandbox')
const AbstractConfineRuntime = require('abstract-confine-runtime')
const {pack, unpack} = require('msgpackr')
const {join} = require('path')

module.exports = class JsIsolateConfineRuntime extends AbstractConfineRuntime {
  constructor (opts) {
    super(opts)
    this.isolate = undefined
  }

  async init () {
    this.isolate = new ModuleSandbox(this.source.toString('utf-8'), {
      path: this.opts.path || '/tmp/fake.js',
      globals: {
        console: {
          log: (ctx, ...args) => this.ipc.notify(0, pack({method: '__console_log', params: {stderr: false, data: args.join(' ')}})),
          error: (ctx, ...args) => this.ipc.notify(0, pack({method: '__console_log', params: {stderr: true, data: args.join(' ')}})),
          warn: (ctx, ...args) => this.ipc.notify(0, pack({method: '__console_log', params: {stderr: true, data: args.join(' ')}}))
        },
        request: async (ctx, body) => {
          let res
          try {
            res = await this.ipc.request(0, pack(body))
          } catch (e) {
            const error = new Error(unpack(e).message)
            throw e
          }
          return typeof res !== 'undefined' ? unpack(res) : undefined
        },
        notify: (ctx, body) => this.ipc.notify(0, pack(body))
      }
    })
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

  async handleRequest (body) {
    if (typeof this.isolate?.rpc?.onrequest === 'function') {
      try {
        return pack(await this.isolate.rpc.onrequest(unpack(body)))
      } catch (e) {
        throw pack({message: e.message || e.toString()})
      }
    } else {
      throw pack({message: 'No request handler defined'})
    }
  }
}