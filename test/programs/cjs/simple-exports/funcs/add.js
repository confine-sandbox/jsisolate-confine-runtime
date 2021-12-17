module.exports = function add (...args) {
  return args.reduce((a, b) => a + b, 0)
}
