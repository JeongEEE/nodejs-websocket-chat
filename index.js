const express = require('express')

const app = express()

const http = require('http')
const server = http.createServer(app)
const { Server } = require('socket.io')
const path = require('path');
const { addUser, getUserInRoom, getUser, removeUser } = require('./utils/users');
const { generateMessage } = require('./utils/messages');
const io = new Server(server)

io.on('connection', (socket) => {
  console.log('socket', socket.id)

  socket.on('join', (options, callback) => {
    const { error, user } = addUser({ id: socket.id, ...options })
    if(error) return callback(error)
    socket.join(user.room)

    socket.emit('message', generateMessage('System', `${user.room} 방에 오신것을 환영합니다`))
    socket.broadcast.to(user.room).emit('message', generateMessage(`${user.username}가 방에 참여하였습니다`))

    io.to(user.room).emit('roomData', {
      room: user.room,
      users: getUserInRoom(user.room)
    })
  })
  socket.on('sendMessage', (message, callback) => {
    const user = getUser(socket.id)

    io.to(user.room).emit('message', generateMessage(user.username, message))
    callback();
  })
  socket.on('disconnect', () => {
    console.log('socket disconnected!', socket.id)
    const user = removeUser(socket.id)

    if(user) {
      io.to(user.room).emit('message', generateMessage('System', `${user.username}가 방을 나갔습니다.`))
      io.to(user.room).emit('roomData', {
        room: user.room,
        users: getUserInRoom(user.room)
      })
    }
  })
})


app.use(express.static(path.join(__dirname, './public')))

const port = 4000
server.listen(port, () => {
  console.log(`port = ${port} 에서 서버 실행!`)
})