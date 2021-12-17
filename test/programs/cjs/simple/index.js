const { add, mult } = require('./funcs')

start()

async function start () {
  console.log('add result:', add(1, 2))
  console.log('mult result:', mult(1, 2))
}
