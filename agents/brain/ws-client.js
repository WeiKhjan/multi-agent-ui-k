'use strict';

const { io } = require('socket.io-client');

/**
 * WebSocket Client: connects Agent_K-Brain to UI_K server on Mac 2.
 * Handles reconnection, room joining, and event routing.
 */
class WSClient {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || process.env.UIK_SERVER_URL;
    this.apiKey = options.apiKey || process.env.BRAIN_AGENT_API_KEY;
    this.socket = null;
    this.connected = false;
    this.handlers = {};
    this.joinedRooms = new Set();
  }

  /**
   * Connect to UI_K server.
   */
  connect() {
    console.log(`[ws-client] Connecting to ${this.serverUrl}...`);

    this.socket = io(this.serverUrl, {
      auth: {
        agentId: 'brain_agent',
        agentApiKey: this.apiKey
      },
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('[ws-client] Connected to UI_K server');
      this.socket.emit('agent_status_update', { status: 'online' });
      this._emit('connected');

      // Rejoin rooms after reconnection
      for (const roomId of this.joinedRooms) {
        this.socket.emit('join_room', { roomId });
      }
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      console.log('[ws-client] Disconnected:', reason);
      this._emit('disconnected', reason);
    });

    this.socket.on('new_message', (msg) => this._emit('new_message', msg));
    this.socket.on('task_assigned', (task) => this._emit('task_assigned', task));
    this.socket.on('joined_room', (data) => this._emit('joined_room', data));
    this.socket.on('error_msg', (data) => this._emit('error_msg', data));

    this.socket.on('connect_error', (err) => {
      console.error('[ws-client] Connection error:', err.message);
    });

    return this;
  }

  /**
   * Join a room.
   */
  joinRoom(roomId) {
    this.joinedRooms.add(roomId);
    if (this.socket) {
      this.socket.emit('join_room', { roomId });
    }
  }

  /**
   * Send a message to a room.
   */
  sendMessage(roomId, content) {
    if (this.socket) {
      this.socket.emit('send_message', { roomId, content });
    }
  }

  /**
   * Update agent status.
   */
  setStatus(status) {
    if (this.socket) {
      this.socket.emit('agent_status_update', { status });
    }
  }

  /**
   * Send typing indicator.
   */
  sendTyping(roomId) {
    if (this.socket) {
      this.socket.emit('typing', { roomId });
    }
  }

  /**
   * Register event handler.
   */
  on(event, handler) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
    return this;
  }

  _emit(event, data) {
    if (this.handlers[event]) {
      for (const handler of this.handlers[event]) {
        try { handler(data); } catch (e) { console.error('[ws-client] Handler error:', e); }
      }
    }
  }

  isConnected() { return this.connected; }
}

module.exports = WSClient;
