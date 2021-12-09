const {unpack} = require('msgpackr')

module.exports.fakeIpc = () => {
  const messages = []
  const ipc = {messages}
  ipc.request = (cid, body) => { messages.push({type: 'request', cid, body: unpack(body)}) }
  ipc.notify = (cid, body) => { messages.push({type: 'notify', cid, body: unpack(body)}) }
  return ipc
}