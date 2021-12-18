const fs = require('fs')
const { APIDescription, APIObject, APIMethod, MethodNotFound } = require('abstract-confine-runtime')
const { NanoresourcePromise: Nanoresource } = require('nanoresource-promise/emitter')
const { unflatten } = require('flat')
const _get = require('lodash.get')
const ivm = require('@andrewosh/isolated-vm')
const RequireController = require('./cjs-module/requires')
const ImportController = require('./esm-module/imports')
const cjsGuest = require('./cjs-module/guest')
const nodejsEnvGuest = require('./nodejs-env/guest')

const ENVS = ['vanilla', 'nodejs']
const DEFAULT_ENV = 'vanilla'

class BaseIsolate extends Nanoresource {
  constructor (source, opts = {}) {
    super()
    this.source = source
    this.path = opts.path
    this.fs = opts.fs || fs.promises
    this.env = ENVS.includes(opts.env) ? opts.env : DEFAULT_ENV
    this.isolate = new ivm.Isolate(opts)
    this.context = undefined
    this.rpc = null
    this.exitCode = undefined

    this._globals = deepMapOpt(opts.globals)
    this._requires = mapOpt(opts.requires)

    this.ready = this.open.bind(this)
  }

  async run () {
  }

  describeAPI () {
    return new APIDescription([])
  }

  async handleAPICall (methodName, params) {
    throw new MethodNotFound(`Method not found: ${methodName}`)
  }

  // nanoresource methods
  // =

  async _open () {
    const context = await this.isolate.createContext()
    const jail = context.global
    // This make the global object available in the context as `global`. We use `derefInto()` here
    // because otherwise `global` would actually be a Reference{} object in the new isolate.
    await jail.set('global', jail.derefInto())
    this.context = context
  }

  async _close () {
    this.isolate?.dispose()
  }

  // private methods
  // =

  _onProcessExit (code) {
    this.exitCode = code
    this.close()
  }

  async _attachGlobals (context, globalsNode, prefix = '') {
    for (const [name, value] of globalsNode) {
      if (value instanceof Map) {
        await context.evalClosure(`global.${prefix}${name} = {}`)
        await this._attachGlobals(context, value, `${prefix}${name}.`)
      } else if (typeof value === 'function') {
        const func = value
        await context.evalClosure(`global.${prefix}${name} = function (...args) {
          return $0.apply(undefined, args, { result: { promise: true, copy: true }, arguments: { copy: true } })
        }`, [new ivm.Reference(func)], { result: { copy: true }, arguments: { copy: true } })
      }
    }
  }

  async _configureEnvironment () {
    const context = this.context
    if (this._globals) await this._attachGlobals(context, this._globals)
    if (!this._globals?.has('console')) {
      // Enable logging.
      await context.evalClosure(`global.console.log = function(...args) {
          $0.applyIgnored(undefined, args, { arguments: { copy: true } });
      }`, [(...args) => console.log('[SANDBOX]', ...args)], { arguments: { reference: true } })
    }
  }
}

exports.CjsIsolate = class CjsIsolate extends BaseIsolate {
  constructor (source, opts = {}) {
    super(source, opts)
    this.script = null
    this.rpc = undefined
    this._requireController = null
  }

  async run () {
    await this.open()
    await this.script.run(this.context)
    await this._attachExports(this.context)
  }

  describeAPI () {
    return new APIDescription(toAPIDescription(this.rpc || {}))
  }

  async handleAPICall (methodName, params) {
    const method = _get(this.rpc, methodName)
    if (typeof method === 'function') {
      return await method(...(params || []))
    } else {
      throw new MethodNotFound(`Method not found: ${methodName}`)
    }
  }

  // nanoresource methods
  // =

  async _open () {
    await super._open()
    
    this._requireController = new RequireController(this.fs, this.path, {
      includeNodeShims: this.env === 'nodejs',
      overrides: this._requires
    })
    await this._configureEnvironment()
    this.script = await this.isolate.compileScript(this.source)
  }

  async _close () {
    this.script?.release?.()
    await super._close()
  }

  // private methods
  // =

  async _attachExports (context) {
    let exportedFunctions = await context.eval('__getExportedFunctions()', { copy: true })
    if (!exportedFunctions || !Array.isArray(exportedFunctions)) return
    exportedFunctions = exportedFunctions.map(path => [path, async (...args) => {
      return context.evalClosure(`return module.exports.${path}.apply(undefined, arguments)`, [...args], {
        arguments: { copy: true },
        result: { promise: true, copy: true }
      })
    }])
    exportedFunctions = exportedFunctions.reduce((obj, pair) => {
      obj[pair[0]] = pair[1]
      return obj
    }, {})
    this.rpc = unflatten(exportedFunctions)
  }

  async _configureEnvironment () {
    await super._configureEnvironment()
    const context = this.context

    const controller = this._requireController
    await context.global.set('__requireSignalBuf', new ivm.ExternalCopy(controller.signal).copyInto({ release: true }))
    await context.eval(`
      global.__requireSignal = new Int32Array(__requireSignalBuf)
      global.__requireUnsupported = new Set(['fs', 'net', 'tls', 'http', 'https'])
      global.__requireCache = {}
      global.__requireCompile =  new Function('module', 'exports', '__filename', '__dirname', 'require', '__src', 'eval(__src)')
      global.__requireRootContext = '${controller.rootContext}'
      global.__makeRequire = ${cjsGuest.__makeRequire}
      global.__requireLoad = ${cjsGuest.__requireLoad}
      global.__requireBuild = ${cjsGuest.__requireBuild}
      global.__requireDirname = ${cjsGuest.__requireDirname}

      ${cjsGuest.__attachCjsShims}
      ${this.env === 'nodejs' ? nodejsEnvGuest.__attachNodeShims : ''}
      ${cjsGuest.__getExportedFunctions}
      __attachCjsShims()
      ${this.env === 'nodejs' ? '__attachNodeShims()' : ''}
    `)
    await context.evalClosure(`global.__requireControllerLoad = function (...args) {
      $0.applyIgnored(undefined, [...args, Object.keys(__requireCache), false], { arguments: { copy: true } })
      Atomics.wait(__requireSignal, 0, 0)
      __requireSignal[0] = 0
    }`, [controller.load.bind(controller)], { arguments: { reference: true } })

    await context.evalClosure(`global.__requireControllerFetch = function (...args) {
      return $0.applySync(undefined, args, { arguments: { copy: true } })
    }`, [controller.fetch.bind(controller)], { arguments: { reference: true } })

    await context.eval('global.require = __makeRequire()')
    if (this.env === 'nodejs') {
      await context.evalClosure(`global.__processExit = function (...args) {
        return $0.applySync(undefined, args, { arguments: { copy: true } })
      }`, [this._onProcessExit.bind(this)], { arguments: { reference: true } })
      await context.eval('global.Buffer = require(\'buffer\').Buffer')
    }
  }
}

exports.EsmIsolate = class EsmIsolate extends BaseIsolate {
  constructor (source, opts = {}) {
    super(source, opts)
    this.module = null
    this._disableImports = opts.disableImports === true
    this._importController = null

    if (opts.env === 'nodejs') {
      throw new Error('ESM modules do not support the nodejs environment yet')
    }
  }

  async run () {
    await this.open()
    await this.module.instantiate(this.context, this._importController.resolve.bind(this._importController))
    await this.module.evaluate()
  }

  describeAPI () {
    // TODO: we need to figure out a way to enumerate the keys in `this.module.namespace`
    return new APIDescription([])
  }

  async handleAPICall (methodName, params) {
    const method = _isolateGetFunction(this.module.namespace, methodName.split('.'))
    if (typeof method === 'function') {
      return await method(...(params || []))
    } else {
      throw new MethodNotFound(`Method not found: ${methodName}`)
    }
  }

  // nanoresource methods
  // =
  
  async _open () {
    await super._open()
    
    await this._configureEnvironment()
    this.module = await this.isolate.compileModule(this.source)
    this._importController = new ImportController(this.isolate, this.fs, this.path, this._disableImports)
  }

  async _close () {
    this.module?.release?.()
    await super._close()
  }
}

function mapOpt (opt) {
  if (!opt) return null
  if (opt instanceof Map) return opt
  return new Map(Object.entries(opt))
}

function deepMapOpt (opt) {
  const map = mapOpt(opt)
  if (!map) return null
  return new Map(Array.from(map).map(([k, v]) => {
    if (v && typeof v === 'object') v = deepMapOpt(v)
    return [k, v]
  }))
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

function _isolateGetFunction (ref, path) {
  const key = path.shift()
  const subRef = ref.getSync(key, {reference: true})
  if (path.length) {
    if (subRef?.typeof === 'object') {
      return _isolateGetFunction(subRef, path)
    }
    return undefined
  }
  if (subRef?.typeof === 'function') {
    return (...args) => subRef.apply(null, args, {
      arguments: { copy: true },
      result: { promise: true, copy: true }
    })
  }
  return undefined
}