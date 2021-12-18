module.exports = function mult (...args) {
  return args.reduce((a, b) => a * b, 1)
}
