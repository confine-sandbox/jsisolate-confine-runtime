const fs = require('fs')
const p = require('path')

const { builtinModules } = require('module')
const resolveModule = require('browser-resolve')
const detective = require('detective')
const ivm = require('@andrewosh/isolated-vm')

const NODE_MODULES = new Map([
  ['os', 'os-browserify'],
  ['events', 'events/'],
  ['buffer', 'buffer/'],
  ['util', 'node-util'],
  ['crypto', 'crypto-browserify'],
  ['path', 'path-browserify'],
  ['stream', 'stream-browserify'],
  ['querystring', 'querystring-es3'],
  ['string_decoder', 'string_decoder/'],
  ['url', 'url/']
])

const LOCAL_PREFIX = '@local:'

module.exports = class RequireController {
  constructor (fs, rootContext, opts = {}) {
    this.fs = fs
    this.rootContext = rootContext
    this.signal = new SharedArrayBuffer(64)

    this._overrides = opts.overrides || new Map()
    this._includeNodeShims = opts.includeNodeShims === true
    this._signal = new Int32Array(this.signal)
    this._cache = new Map()
    this._nodeResolved = new Map()
    this._loaded = null
  }

  async _selectFs (name, from) {
    if (typeof this.fs !== 'function') return { name, from, fs: this.fs, prefix: '' }
    return this.fs(name, from)
  }

  async load (name, from, has) {
    if (this._loaded) throw new Error('Did not fetch previous load results')
    has = new Set(has)
    const resolved = new Set()
    const cache = new Map()
    const dups = []
    const modules = []

    const self = this
    await add(name, from)

    this._loaded = [...modules, ...dups]
    this._signal[0] = 1
    Atomics.notify(this._signal, 0, 1)

    async function add (name, from) {
      const filename = await self._browserResolve(name, from, cache)
      if (!filename) return null

      const id = name + '\n' + filename + '\n' + from

      if (has.has(filename)) {
        if (resolved.has(id)) return null
        resolved.add(id)
        dups.push([name, filename, from, ''])
        return null
      }

      has.add(filename)
      resolved.add(id)

      let src = ''
      if (filename.startsWith(LOCAL_PREFIX)) {
        src = await fs.promises.readFile(filename.slice(LOCAL_PREFIX.length), { encoding: 'utf-8' })
      } else {
        const { fs, name } = await self._selectFs(filename, from)
        src = await fs.readFile(name, { encoding: 'utf-8' })
      }

      modules.push([name, filename, from, src])

      const m = detective(src)
      for (const name of m) {
        await add(name, filename)
      }
    }
  }

  fetch () {
    if (!this._loaded) throw new Error('Did not load results, so there\'s nothing to fetch')
    const loaded = new ivm.ExternalCopy(this._loaded).copyInto({ release: true })
    this._loaded = null
    return loaded
  }

  _resolveOpts (fs, basedir) {
    return {
      basedir,
      readFile: (path, cb) => fs.readFile(path).then(res => cb(null, res), err => cb(err)),
      isFile: (path, cb) => {
        fs.stat(path).then(st => cb(null, st.isFile()), (err) => {
          if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return cb(null, false)
          return cb(err)
        })
      },
      isDirectory: (path, cb) => fs.stat(path).then(st => cb(null, st.isDirectory()), err => {
        if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return cb(null, false)
        return cb(err)
      }),
      realpath: (path, cb) => cb(null, path)
    }
  }

  _nodeResolve (name) {
    if (this._nodeResolved.has(name)) return this._nodeResolved.get(name)
    this._nodeResolved.set(name, require.resolve(name))
    return this._nodeResolved.get(name)
  }

  async _browserResolve (name, from, cache) {
    const isLocal = from.startsWith(LOCAL_PREFIX)
    if (this._includeNodeShims && NODE_MODULES.has(name)) {
      return LOCAL_PREFIX + this._nodeResolve(NODE_MODULES.get(name))
    }
    if (this._overrides.has(name) && !isLocal) {
      return LOCAL_PREFIX + this._overrides.get(name)
    }
    if (builtinModules.includes(name)) return null

    const fsResolved = await this._selectFs(name, from)

    let basedir = null
    if (isLocal) {
      from = from.slice(LOCAL_PREFIX.length)
      basedir = p.dirname(from)
      fsResolved.fs = fs.promises
    } else {
      basedir = p.dirname(fsResolved.from)
    }

    const id = name + '\n' + basedir
    if (cache.has(id)) return cache.get(id)

    return new Promise((resolve, reject) => {
      resolveModule(fsResolved.name, this._resolveOpts(fsResolved.fs, basedir), (err, filename) => {
        if (err) return reject(err)
        if (isLocal) filename = LOCAL_PREFIX + filename
        else if (fsResolved.prefix) filename = fsResolved.prefix + filename
        cache.set(id, filename)
        return resolve(filename)
      })
    })
  }
}
