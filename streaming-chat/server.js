const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// NOTE: With session affinity enabled on Cloud Run, each user reconnects to the
// same instance, so the in-memory message buffer is consistent per user session.
// For true multi-instance message sync across all Cloud Run instances, the next
// step would be Redis Pub/Sub (Cloud Memorystore) to broadcast messages globally.

const io = new Server(server, {
  // Tuned for 200-300 concurrent WebSocket connections
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
  transports: ['websocket', 'polling'],
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Enable CORS for all origins (Cloud Run requirement)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Circular buffer — keep last 100 messages for latecomers
const MAX_MESSAGES = 100;
const messageBuffer = [];

function addMessage(msg) {
  if (messageBuffer.length >= MAX_MESSAGES) {
    messageBuffer.shift();
  }
  messageBuffer.push(msg);
}

io.on('connection', (socket) => {
  // Send message history to newly connected client
  socket.emit('message_history', messageBuffer);

  socket.on('send_message', ({ username, text }) => {
    if (!username || !text || typeof text !== 'string') return;

    const trimmedText = text.trim().slice(0, 500); // cap message length
    if (!trimmedText) return;

    const msg = {
      username: String(username).trim().slice(0, 32),
      text: trimmedText,
      timestamp: new Date().toISOString(),
      color: socket.handshake.auth.color || '#888888',
    };

    addMessage(msg);
    io.emit('new_message', msg);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Live chat server running on port ${PORT}`);
});
