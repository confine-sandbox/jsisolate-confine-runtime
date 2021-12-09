module.exports = {
  onrequest: async body => {
    await request({isRequest: true})
    notify({isNotify: true})
    return body
  }
}