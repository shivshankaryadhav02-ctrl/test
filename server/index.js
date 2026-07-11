require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

// ─── APP CONFIG ───────────────────────────────────────────────────────────────
const APP_NAME = process.env.APP_NAME || 'RemoteLink';
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!MONGODB_URI) console.warn('⚠️  MONGODB_URI is not set — DB features will not work');
if (!JWT_SECRET) console.warn('⚠️  JWT_SECRET is not set — Auth will not work');

// ─── EXPRESS SETUP ────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── SOCKET.IO (Relay Hub) ────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 20 * 1024 * 1024 // 20MB for screen frames
});

// In-memory store: pairingToken → { desktopSocket, mobileSocket }
const sessions = new Map();

io.on('connection', (socket) => {
  console.log(`[Relay] Socket connected: ${socket.id}`);

  // ── Desktop or Mobile identifies itself ──────────────────────────────────
  socket.on('identify', (data) => {
    const { type, deviceId, pairingToken, hostname, username, version } = data;
    const token = (pairingToken || '').toUpperCase();

    console.log(`[Relay] ${type} identified | token=${token} | device=${deviceId}`);

    socket.pairingToken = token;
    socket.clientType = type;
    socket.deviceId = deviceId;

    if (!sessions.has(token)) {
      sessions.set(token, { desktop: null, mobile: null });
    }
    const session = sessions.get(token);

    if (type === 'desktop') {
      session.desktop = socket;
      socket.emit('identified', { status: 'connected', token });
      // Notify mobile if already waiting
      if (session.mobile) {
        session.mobile.emit('desktop-connected', {
          hostname: hostname || 'PC',
          username: username || 'User'
        });
      }
    } else if (type === 'mobile') {
      session.mobile = socket;
      socket.emit('identified', { status: 'connected', token });
      // Notify desktop if already connected
      if (session.desktop) {
        session.desktop.emit('mobile-connected');
      }
    }
  });

  // ── Desktop → Mobile relay ─────────────────────────────────────────────
  socket.on('to-mobile', (data) => {
    const { deviceId, event, payload } = data;
    const token = socket.pairingToken;
    if (!token) return;

    const session = sessions.get(token);
    if (session?.mobile?.connected) {
      session.mobile.emit(event, payload);
    }
  });

  // ── Mobile → Desktop commands ──────────────────────────────────────────
  socket.on('command:move-mouse', (data) => relayToDesktop(socket, 'command:move-mouse', data));
  socket.on('command:click',      (data) => relayToDesktop(socket, 'command:click', data));
  socket.on('command:type',       (data) => relayToDesktop(socket, 'command:type', data));
  socket.on('command:key',        (data) => relayToDesktop(socket, 'command:key', data));
  socket.on('command:scroll',     (data) => relayToDesktop(socket, 'command:scroll', data));
  socket.on('command:peek',       (data) => relayToDesktop(socket, 'command:peek', data));
  socket.on('command:lock',       (data) => relayToDesktop(socket, 'command:lock', data));
  socket.on('command:camera',     (data) => relayToDesktop(socket, 'command:camera', data));
  socket.on('command:camera-stop',(data) => relayToDesktop(socket, 'command:camera-stop', data));
  socket.on('command:audio-start',(data) => relayToDesktop(socket, 'command:audio-start', data));
  socket.on('command:audio-stop', (data) => relayToDesktop(socket, 'command:audio-stop', data));
  socket.on('command:stealth-stream-start', (data) => relayToDesktop(socket, 'command:stealth-stream-start', data));
  socket.on('command:stealth-stream-stop',  (data) => relayToDesktop(socket, 'command:stealth-stream-stop', data));

  // ── WebRTC Signaling ────────────────────────────────────────────────────
  socket.on('webrtc:offer',     (data) => relayToDesktop(socket, 'webrtc:offer', data));
  socket.on('webrtc:answer',    (data) => relayToMobile(socket, 'webrtc:answer', data));
  socket.on('webrtc:candidate', (data) => {
    const token = socket.pairingToken;
    if (!token) return;
    const session = sessions.get(token);
    if (socket.clientType === 'mobile' && session?.desktop?.connected) {
      session.desktop.emit('webrtc:candidate', data);
    } else if (socket.clientType === 'desktop' && session?.mobile?.connected) {
      session.mobile.emit('webrtc:candidate', data);
    }
  });

  // ── Disconnect ─────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const token = socket.pairingToken;
    console.log(`[Relay] Socket disconnected: ${socket.id} (token=${token})`);

    if (!token) return;
    const session = sessions.get(token);
    if (!session) return;

    if (socket.clientType === 'desktop') {
      session.desktop = null;
      if (session.mobile?.connected) {
        session.mobile.emit('desktop-disconnected');
      }
    } else if (socket.clientType === 'mobile') {
      session.mobile = null;
      if (session.desktop?.connected) {
        session.desktop.emit('mobile-disconnected');
      }
    }

    // Clean up empty sessions
    if (!session.desktop && !session.mobile) {
      sessions.delete(token);
    }
  });
});

function relayToDesktop(fromSocket, event, data) {
  const token = fromSocket.pairingToken;
  if (!token) return;
  const session = sessions.get(token);
  if (session?.desktop?.connected) {
    session.desktop.emit(event, data);
  }
}

function relayToMobile(fromSocket, event, data) {
  const token = fromSocket.pairingToken;
  if (!token) return;
  const session = sessions.get(token);
  if (session?.mobile?.connected) {
    session.mobile.emit(event, data);
  }
}

// ─── REST API ROUTES ─────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/devices', require('./routes/devices'));

// Health check
app.get('/', (req, res) => {
  res.json({
    app: APP_NAME,
    status: 'running',
    activeSessions: sessions.size,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── START SERVER IMMEDIATELY (Railway healthcheck requires fast response) ─────
server.listen(PORT, () => {
  console.log(`🚀 ${APP_NAME} relay server running on port ${PORT}`);
});

// ─── CONNECT MONGODB IN BACKGROUND ───────────────────────────────────────────
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('✅ MongoDB connected');
    })
    .catch(err => {
      console.error('❌ MongoDB connection failed:', err.message);
    });
} else {
  console.error('❌ MONGODB_URI missing — set it in Railway Variables tab');
}

module.exports = { app, io };
