const fs = require('fs')

const { NanoresourcePromise: Nanoresource } = require('nanoresource-promise/emitter')
const { unflatten } = require('flat')
const ivm = require('@andrewosh/isolated-vm')
const RequireController = require('./cjs-module/requires')
const cjsGuest = require('./cjs-module/guest')
const nodejsEnvGuest = require('./nodejs-env/guest')

const MODULES = ['cjs']
const DEFAULT_MODULE = 'cjs'

const ENVS = ['vanilla', 'nodejs']
const DEFAULT_ENV = 'vanilla'

module.exports = class Isolate extends Nanoresource {
  constructor (source, opts = {}) {
    super()
    this.source = source
    this.path = opts.path
    this.fs = opts.fs || fs.promises
    this.module = MODULES.includes(opts.module) ? opts.module : DEFAULT_MODULE
    this.env = ENVS.includes(opts.env) ? opts.env : DEFAULT_ENV
    this.isolate = new ivm.Isolate(opts)
    this.context = undefined
    this.script = null
    this.rpc = null
    this.exitCode = undefined

    this._requireController = null
    this._globals = deepMapOpt(opts.globals)
    this._requires = mapOpt(opts.requires)

    this.ready = this.open.bind(this)
  }

  // Execution

  async run () {
    await this.open()
    await this.script.run(this.context)

    // Attach exported stuff to this.exports
    await this._attachExports(this.context)
  }

  // Nanoresource Methods

  async _open () {
    const context = await this.isolate.createContext()
    const jail = context.global
    // This make the global object available in the context as `global`. We use `derefInto()` here
    // because otherwise `global` would actually be a Reference{} object in the new isolate.
    await jail.set('global', jail.derefInto())

    if (this.module === 'cjs') {
      this._requireController = new RequireController(this.fs, this.path, {
        includeNodeShims: this.env === 'nodejs',
        overrides: this._requires
      })
    }
    await this._configureEnvironment(context, this._requireController)

    this.context = context

    this.script = await this.isolate.compileScript(this.source)
  }

  async _close () {
    // TODO: Any other cleanup required?
    this.isolate.dispose()
  }

  // Private Methods

  _onProcessExit (code) {
    this.exitCode = code
    this.close()
  }

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

  async _configureEnvironment (context) {
    if (this._globals) await this._attachGlobals(context, this._globals)
    if (!this._globals?.has('console')) {
      // Enable logging.
      await context.evalClosure(`global.console.log = function(...args) {
          $0.applyIgnored(undefined, args, { arguments: { copy: true } });
      }`, [(...args) => console.log('[SANDBOX]', ...args)], { arguments: { reference: true } })
    }

    if (this.module === 'cjs') {
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
