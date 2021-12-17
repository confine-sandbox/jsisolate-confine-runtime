const { add, mult } = require('./funcs')

function double (arr) {
  return arr.map(x => x * 2)
}

function greet (obj) {
  return { hello: obj.name + ' and world' }  
}

module.exports = {
  add,
  mult,
  arrays: { double },
  objects: { greet }
}
