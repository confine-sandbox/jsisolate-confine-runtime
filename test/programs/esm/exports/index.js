export { add } from './funcs/add.js'
export { mult } from './funcs/mult.js'

export const arrays = {
  double (arr) {
    return arr.map(x => x * 2)
  }
}

export const objects = {
  greet (obj) {
    return { hello: obj.name + ' and world' }  
  }
}
