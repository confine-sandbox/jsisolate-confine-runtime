const fs = require('fs')

const names = fs.readdirSync(process.cwd(), 'utf-8')
console.log(names)