/**
 * Socket.IO client handler for UI_K.
 * Manages WebSocket connection, events, and reconnection.
 */
const SocketHandler = (() => {
  let socket = null;
  let connected = false;

  // Event listeners
  const listeners = {
    new_message: [],
    agent_status: [],
    typing: [],
    task_update: [],
    joined_room: [],
    error_msg: []
  };

  function init() {
    socket = io({
      auth: {
        // In dev mode, no token needed
        cfToken: null
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    socket.on('connect', () => {
      connected = true;
      console.log('[ws] Connected to UI_K server');
      _emit('connected');
    });

    socket.on('disconnect', (reason) => {
      connected = false;
      console.log('[ws] Disconnected:', reason);
      _emit('disconnected');
    });

    // Message events
    socket.on('new_message', (msg) => _emit('new_message', msg));
    socket.on('agent_status', (data) => _emit('agent_status', data));
    socket.on('typing', (data) => _emit('typing', data));
    socket.on('task_update', (data) => _emit('task_update', data));
    socket.on('joined_room', (data) => _emit('joined_room', data));
    socket.on('error_msg', (data) => _emit('error_msg', data));

    return socket;
  }

  function joinRoom(roomId) {
    if (socket) socket.emit('join_room', { roomId });
  }

  function leaveRoom(roomId) {
    if (socket) socket.emit('leave_room', { roomId });
  }

  function sendMessage(roomId, content) {
    if (socket && content.trim()) {
      socket.emit('send_message', { roomId, content: content.trim() });
    }
  }

  function sendTyping(roomId) {
    if (socket) socket.emit('typing', { roomId });
  }

  function requestTask(roomId, taskType, parameters) {
    if (socket) socket.emit('request_task', { roomId, taskType, parameters });
  }

  function on(event, callback) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
  }

  function off(event, callback) {
    if (listeners[event]) {
      listeners[event] = listeners[event].filter(cb => cb !== callback);
    }
  }

  function _emit(event, data) {
    if (listeners[event]) {
      for (const cb of listeners[event]) {
        try { cb(data); } catch (e) { console.error('[ws] Listener error:', e); }
      }
    }
  }

  function isConnected() { return connected; }

  return {
    init, joinRoom, leaveRoom, sendMessage, sendTyping,
    requestTask, on, off, isConnected
  };
})();
