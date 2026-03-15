'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');

const { authMiddleware, socketAuthMiddleware } = require('./auth');
const RoomManager = require('./rooms');
const MessageHandler = require('./messages');
const AgentManager = require('./agents');
const { upload, serveFile, handleUpload, FILE_ROOT } = require('./files');

// --- Database ---
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'db', 'uik.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Services ---
const roomManager = new RoomManager(db);
const messageHandler = new MessageHandler(db);
const agentManager = new AgentManager(db);

// --- Express ---
const app = express();
const server = createServer(app);

app.use(express.json());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Auth Middleware (HTTP) ---
const auth = authMiddleware(db);

// --- API Routes ---

// Get rooms for authenticated user
app.get('/api/rooms', auth, (req, res) => {
  const rooms = roomManager.getRoomsForUser(
    req.user.id, req.user.role, req.user.agentType
  );
  res.json(rooms);
});

// Get messages for a room (paginated)
app.get('/api/rooms/:id/messages', auth, (req, res) => {
  const roomId = req.params.id;

  // Check access
  if (!roomManager.canAccess(roomId, req.user.id, req.user.agentType)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const room = roomManager.getRoom(roomId);
  // Only return unmasked content to humans in vault/client rooms (never to Brain agent)
  const includeUnmasked = req.user.agentType !== 'brain' &&
    (room.type === 'vault' || room.type === 'client');

  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const messages = messageHandler.getMessages(roomId, limit, offset, { includeUnmasked });
  res.json(messages);
});

// Create a new room
app.post('/api/rooms', auth, (req, res) => {
  if (req.user.role !== 'owner' && req.user.role !== 'partner') {
    return res.status(403).json({ error: 'Only owner/partner can create rooms' });
  }

  const { name, type, clientId, description } = req.body;
  if (!name || !type) {
    return res.status(400).json({ error: 'Name and type required' });
  }

  if (!['vault', 'shared', 'ops', 'client'].includes(type)) {
    return res.status(400).json({ error: 'Invalid room type' });
  }

  const room = roomManager.createRoom(name, type, {
    clientId,
    description,
    createdBy: req.user.id
  });
  res.json(room);
});

// Add member to room
app.post('/api/rooms/:id/members', auth, (req, res) => {
  const { userId, role } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  try {
    // Resolve agentType if adding an agent — enforce Brain room restrictions
    const agent = agentManager.getAgent(userId);
    const agentType = agent ? agent.type : null;
    roomManager.addMember(req.params.id, userId, role, agentType);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get agent status
app.get('/api/agents', auth, (req, res) => {
  res.json(agentManager.listAgents());
});

// Search messages in a room
app.get('/api/rooms/:id/search', auth, (req, res) => {
  const roomId = req.params.id;
  if (!roomManager.canAccess(roomId, req.user.id, req.user.agentType)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const query = req.query.q;
  if (!query) return res.json([]);
  const room = roomManager.getRoom(roomId);
  const includeUnmasked = req.user.agentType !== 'brain' &&
    (room && (room.type === 'vault' || room.type === 'client'));
  const results = messageHandler.searchMessages(roomId, query, 20, { includeUnmasked });
  res.json(results);
});

// File serving — with room-level access check
app.get('/api/files/*', auth, (req, res, next) => {
  // Extract roomId from file path (files are stored as /roomId/filename)
  const filePath = req.params[0] || '';
  const roomId = filePath.split('/')[0];
  if (roomId && !roomManager.canAccess(roomId, req.user.id, req.user.agentType)) {
    return res.status(403).json({ error: 'Access denied to this file' });
  }
  next();
}, serveFile);

// File upload — with room access check
app.post('/api/rooms/:roomId/upload', auth, (req, res, next) => {
  const roomId = req.params.roomId;
  if (!roomManager.canAccess(roomId, req.user.id, req.user.agentType)) {
    return res.status(403).json({ error: 'Access denied to this room' });
  }
  next();
}, upload.single('file'), handleUpload);

// Health check — basic status only (no agent details without auth)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Detailed health (authenticated)
app.get('/api/health/details', auth, (req, res) => {
  res.json({
    status: 'ok',
    agents: agentManager.listAgents(),
    uptime: process.uptime()
  });
});

// --- Socket.IO ---
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || (process.env.DEV_MODE === 'true' ? '*' : false)
  },
  maxHttpBufferSize: 1e7 // 10MB
});

io.use(socketAuthMiddleware(db));

io.on('connection', (socket) => {
  const user = socket.user;
  console.log(`[ws] Connected: ${user.display_name} (${user.id})`);

  // Agent connection handling
  if (socket.isAgent) {
    agentManager.connect(user.id, socket);
    io.emit('agent_status', { agentId: user.id, status: 'online' });
  }

  // Join room
  socket.on('join_room', ({ roomId }) => {
    if (!roomManager.canAccess(roomId, user.id, user.agentType)) {
      socket.emit('error_msg', { error: 'Access denied to room', roomId });
      return;
    }
    socket.join(roomId);
    socket.emit('joined_room', { roomId });
  });

  // Leave room
  socket.on('leave_room', ({ roomId }) => {
    socket.leave(roomId);
  });

  // Send message
  socket.on('send_message', ({ roomId, content, files }) => {
    if (!content || !roomId) return;

    // Verify room access
    if (!roomManager.canAccess(roomId, user.id, user.agentType)) {
      socket.emit('error_msg', { error: 'Access denied' });
      return;
    }

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    // Determine sender type
    let senderType = 'human';
    if (user.id === 'vault_agent') senderType = 'vault_agent';
    else if (user.id === 'brain_agent') senderType = 'brain_agent';

    // Store message (masking applied automatically for shared rooms)
    const { message, wasMasked } = messageHandler.storeMessage(
      room, user.id, senderType, content, { hasFile: !!files }
    );

    // Broadcast to room
    const payload = {
      id: message.id,
      roomId,
      senderId: user.id,
      senderType,
      senderName: user.display_name,
      content: message.content, // Already masked for shared rooms
      hasFile: message.has_file,
      fileName: message.file_name,
      wasMasked,
      createdAt: message.created_at
    };

    io.to(roomId).emit('new_message', payload);
  });

  // Agent-specific: send message with explicit masking control
  socket.on('agent_message', ({ roomId, content, masked }) => {
    if (!socket.isAgent) return;

    const room = roomManager.getRoom(roomId);
    if (!room) return;
    if (!roomManager.canAccess(roomId, user.id, user.agentType)) return;

    const senderType = user.id === 'vault_agent' ? 'vault_agent' : 'brain_agent';

    // Vault agent can specify pre-masked content
    let storeContent = content;
    if (user.id === 'vault_agent' && masked && room.type === 'shared') {
      // Content is already masked by the vault agent
      storeContent = content;
    }

    const { message, wasMasked } = messageHandler.storeMessage(
      room, user.id, senderType, storeContent
    );

    io.to(roomId).emit('new_message', {
      id: message.id,
      roomId,
      senderId: user.id,
      senderType,
      senderName: user.display_name,
      content: message.content,
      wasMasked,
      createdAt: message.created_at
    });
  });

  // Typing indicator
  socket.on('typing', ({ roomId }) => {
    if (!roomManager.canAccess(roomId, user.id, user.agentType)) return;
    socket.to(roomId).emit('typing', {
      roomId,
      senderId: user.id,
      senderName: user.display_name
    });
  });

  // Agent status update
  socket.on('agent_status_update', ({ status }) => {
    if (!socket.isAgent) return;
    agentManager.setStatus(user.id, status);
    io.emit('agent_status', { agentId: user.id, status });
  });

  // Task request (human → agent)
  socket.on('request_task', ({ roomId, taskType, parameters }) => {
    if (!roomId || !taskType) return;

    // Verify room access
    if (!roomManager.canAccess(roomId, user.id, user.agentType)) {
      socket.emit('error_msg', { error: 'Access denied' });
      return;
    }

    const task = db.prepare(`
      INSERT INTO tasks (room_id, requested_by, assigned_agent, task_type, parameters)
      VALUES (?, ?, ?, ?, ?)
    `).run(roomId, user.id, 'vault_agent', taskType, JSON.stringify(parameters || {}));

    const taskData = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.lastInsertRowid);

    // Notify vault agent
    const vaultSocket = agentManager.getSocket('vault_agent');
    if (vaultSocket) {
      vaultSocket.emit('task_assigned', taskData);
    }

    io.to(roomId).emit('task_update', {
      taskId: taskData.id,
      status: 'pending',
      taskType
    });
  });

  // Task result (agent → room) — agent can only update tasks assigned to it
  socket.on('task_result', ({ taskId, status, result }) => {
    if (!socket.isAgent) return;

    // Verify this task is assigned to this agent
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task || task.assigned_agent !== user.id) {
      socket.emit('error_msg', { error: 'Task not assigned to this agent' });
      return;
    }

    db.prepare(`
      UPDATE tasks SET status = ?, result_summary = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND assigned_agent = ?
    `).run(status, result, taskId, user.id);

    io.to(task.room_id).emit('task_update', {
      taskId,
      status,
      result
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`[ws] Disconnected: ${user.display_name}`);
    if (socket.isAgent) {
      agentManager.disconnect(user.id);
      io.emit('agent_status', { agentId: user.id, status: 'offline' });
    }
  });
});

// --- Start Server ---
const PORT = parseInt(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════╗
║      Multi-Agent UI_K Server v1.0        ║
║══════════════════════════════════════════║
║  Running on: http://${HOST}:${PORT}          ║
║  Mode: ${process.env.DEV_MODE === 'true' ? 'DEVELOPMENT (auth bypass)' : 'PRODUCTION                '}  ║
║  Database: ${dbPath.split('/').pop().padEnd(28)}  ║
╚══════════════════════════════════════════╝
  `);
});

module.exports = { app, server, io, db };
