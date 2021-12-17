function __makeRequire (from) {
  return function require (name) {
    if (__requireUnsupported.has(name)) return {}
    const mod = __requireLoad(name, from)
    if (!mod) throw new Error('Could not require "' + name + '" from "' + from + '"')
    return mod.exports
  }
}

function __requireBuild (m) {
  if (!m) return null

  if (m.loaded) return m
  m.loaded = true

  if (/\.json$/.test(m.filename)) {
    m.exports = JSON.parse(m.source)
  } else {
    const gen = m.source + '\n//# sourceURL=' + m.sourceURL + '\n'
    __requireCompile(m, m.exports, m.filename, m.dirname, __makeRequire(m.filename), gen)
  }

  m.source = null
  return m
}

function __requireLoad (name, from = __requireRootContext) {
  if (__requireCache[from] && __requireCache[from].requires[name]) return __requireBuild(__requireCache[from]?.requires[name])

  // This first call will wait on the SAB.
  __requireControllerLoad(name, from)

  // After the previous call, the modules will be cached in the parent, so this is sync.
  const modules = __requireControllerFetch(name, from)

  for (const [name, filename, from, source] of modules) {
    const ctx = __requireCache[from] = __requireCache[from] || { requires: {}, exports: {} }
    if (ctx.requires[name]) continue

    ctx.requires[name] = __requireCache[filename] = __requireCache[filename] || {
      loaded: false,
      requires: {},
      exports: {},
      sourceURL: 'file://' + filename,
      dirname: __requireDirname(filename),
      source,
      filename
    }
  }

  return __requireBuild(__requireCache[from]?.requires[name])
}

function __requireDirname (filename) {
  return filename.split('/').slice(0, -1).join('/')
}

function __getExportedFunctions () {
  if (!module.exports) return {}
  const functions = []
  const queue = [{ ctx: [], obj: module.exports }]
  while (queue.length) {
    const { ctx, obj } = queue.pop()
    const type = typeof obj
    if (type === 'object') {
      queue.push(...Object.keys(obj).map(k => {
        return { ctx: [...ctx, k], obj: obj[k] }
      }))
      continue
    } else if (type === 'function') {
      functions.push(ctx.join('.'))
    }
  }
  return functions
}

function __attachCjsShims () {
  global.module = {}
}

module.exports = {
  __requireDirname,
  __requireLoad,
  __requireBuild,
  __makeRequire,
  __getExportedFunctions,
  __attachCjsShims
}
