const path = require('path')

module.exports = class ImportController {
  constructor (vmIsolate, fs, modulePath, disableImports) {
    this.vmIsolate = vmIsolate
    this.fs = fs
    this.basePath = path.dirname(modulePath)
    this.disableImports = disableImports
    this.modulePromiseCache = new Map()
  }

  resolve (specifier, referrer) {
    const modulePath = this._resolveSpecifier(specifier)
    let promise = this.modulePromiseCache.get(modulePath)
    if (!promise) {
      promise = this._resolveModule(modulePath)
      this.modulePromiseCache.set(modulePath, promise)
    }
    return promise
  }

  _resolveSpecifier (specifier) {
    const modulePath = path.join(this.basePath, specifier)
    const relative = path.relative(this.basePath, modulePath)
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return modulePath
    }
    return '@@empty'
  }

  async _resolveModule (modulePath) {
    const sourceCode = this.disableImports || modulePath === '@@empty' ? '' : await this.fs.readFile(modulePath, 'utf-8').catch(e => { console.log(e); return '' })
    return this.vmIsolate.compileModule(sourceCode)
  }
}