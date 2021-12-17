const Isolate = require('./lib/isolate.js')
const { AbstractConfineRuntime, APIDescription, APIObject, APIMethod, MethodNotFound } = require('abstract-confine-runtime')
const _get = require('lodash.get')

module.exports = class JsIsolateConfineRuntime extends AbstractConfineRuntime {
  constructor (opts) {
    super(opts)
    this.isolate = undefined
  }

  async init () {
    this.isolate = new Isolate(this.source.toString('utf-8'), {
      path: this.opts.path || '/tmp/script.js',
      env: this.opts.env,
      module: this.opts.module,
      globals: this.opts.globals,
      requires: this.opts.requires
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


  describeAPI () {
    return new APIDescription(toAPIDescription(this.isolate?.rpc || {}))
  }

  async handleAPICall (methodName, params) {
    const method = _get(this.isolate?.rpc, methodName)
    if (typeof method === 'function') {
      return await method(...(params || []))
    } else {
      throw new MethodNotFound(`Method not found: ${methodName}`)
    }
  }
}

function toAPIDescription (obj) {
  const items = []
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'function') {
      items.push(new APIMethod(key))
    } else if (value && typeof value === 'object') {
      items.push(new APIObject(key, toAPIDescription(value)))
    }
  }
  return items
}