require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { sessionMiddleware } = require('./middleware/session');
const registerSocketHandlers = require('./socket/handlers');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5004;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

const io = new Server(server, {
    cors: { origin: CLIENT_URL, credentials: true },
    pingInterval: 10000,
    pingTimeout: 15000,
});

app.set('trust proxy', 1);
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(sessionMiddleware);

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/monopoly')
    .then(() => console.log('[mongo] connected'))
    .catch(err => console.error('[mongo] connection error:', err.message));

app.use('/api', require('./routes/rooms'));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/me', (req, res) => res.json({ userId: req.userId }));

registerSocketHandlers(io);

server.listen(PORT, () => console.log(`[monopoly] server on ${PORT}`));
