function __attachNodeShims () {
  global.queueMicrotask = (cb) => Promise.resolve().then(cb)
  global.setImmediate = (cb, ...args) => {
    throw new Error('setImmediate is not deterministic')
  }

  global.nextTick = function (cb, ...args) {
    if (args.length) return nextTickArgs(cb, ...args)
    queueMicrotask(cb)
  }

  global.nextTickArgs = function (cb, ...args) {
    queueMicrotask(() => cb(...args))
  }

  global.process = {
    browser: true,
    nextTick,
    env: {},
    cwd () {
      return '/'
    },
    get EventEmitter () {
      return require('events').EventEmitter
    },
    exit (code) {
      __processExit(code)
    }
  }
}

module.exports = {
  __attachNodeShims
}
