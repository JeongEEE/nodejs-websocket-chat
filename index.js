const express = require('express')

const app = express()

const http = require('http')
const server = http.createServer(app)
const { Server } = require('socket.io')
const io = new Server(server)
const path = require('path');
const { addUser, getUserInRoom, getUser, removeUser } = require('./src/utils/users');
const { generateMessage, saveMessages, fetchMessages } = require('./src/utils/messages');
const mongoose = require('mongoose');
app.use(express.json())
require('dotenv').config()
const crypto = require('crypto')

const randomId = () => crypto.randomBytes(8).toString('hex')
app.post('/session', (req, res) => {
  const data = {
    username: req.body.username,
    userID: randomId()
  }
  res.send(data)
})

io.use((socket, next) => {
  const username = socket.handshake.auth.username
  const userID = socket.handshake.auth.userID
  if(!username) {
    return next(new Error('Invalid username'))
  }

  socket.username = username
  socket.id = userID

  next()
})

let users = [];
io.on('connection', async (socket) => {
  console.log('socket', socket.id)

  let userData = {
    username: socket.username,
    userID: socket.id
  };
  users.push(userData)
  io.emit('users-data', { users })

  // 클라이언트에서 보내온 메시지  A ==> Server  ===> B
  socket.on('message-to-server', (payload) => {
    io.to(payload.to).emit('message-to-client', payload);
    saveMessages(payload);
  })

  // 데이터베이스에서 메시지 가져오기
  socket.on('fetch-messages', ({ receiver }) => {
    fetchMessages(io, socket.id, receiver);
  })

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
    users = users.filter(user => user.userID !== socket.id);
    // 사이드바 리스트에서 없애기
    io.emit('users-data', { users })
    // 대화 중이라면 대화창 없애기
    io.emit('user-away', socket.id);

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

mongoose.set('strictQuery', false)
mongoose.connect(process.env.MONGODB_URL).then(() => {
  console.log('MongoDB Connected!')
}).catch((err) => {
  console.log(err)
})

const port = 4000
server.listen(port, () => {
  console.log(`port = ${port} 에서 서버 실행!`)
})