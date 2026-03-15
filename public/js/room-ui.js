/**
 * Room UI: sidebar rendering, room switching, create room modal.
 */
const RoomUI = (() => {
  let rooms = [];
  let activeRoomId = null;

  const ROOM_ICONS = {
    vault: '\u{1F512}',
    shared: '\u{1F4AC}',
    ops: '\u{1F6E0}',
    client: '\u{1F4CB}'
  };

  async function init() {
    await loadRooms();
    _bindEvents();
  }

  async function loadRooms() {
    try {
      const res = await fetch('/api/rooms');
      rooms = await res.json();
      _renderRoomList();
    } catch (err) {
      console.error('[rooms] Failed to load:', err);
    }
  }

  function _renderRoomList() {
    const container = document.getElementById('room-list');
    container.innerHTML = '';

    for (const room of rooms) {
      const el = document.createElement('div');
      el.className = 'room-item' + (room.id === activeRoomId ? ' active' : '');
      el.dataset.roomId = room.id;

      el.innerHTML = `
        <span class="room-icon">${ROOM_ICONS[room.type] || '\u{1F4AC}'}</span>
        <span class="room-name">${_escapeHtml(room.name)}</span>
        <span class="room-badge ${room.type}">${room.type.toUpperCase()}</span>
      `;

      el.addEventListener('click', () => switchRoom(room.id));
      container.appendChild(el);
    }
  }

  function switchRoom(roomId) {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    // Leave previous room
    if (activeRoomId) {
      SocketHandler.leaveRoom(activeRoomId);
    }

    activeRoomId = roomId;
    _renderRoomList();

    // Update header
    document.getElementById('room-type-icon').textContent = ROOM_ICONS[room.type] || '';
    document.getElementById('room-title').textContent = room.name;
    document.getElementById('room-description').textContent = room.description || '';

    // Show chat view, hide welcome
    document.getElementById('welcome-screen').style.display = 'none';
    const chatView = document.getElementById('chat-view');
    chatView.style.display = 'flex';

    // Join room via WebSocket
    SocketHandler.joinRoom(roomId);

    // Load messages
    MessageUI.loadMessages(roomId);

    // Focus input
    document.getElementById('message-input').focus();
  }

  function getActiveRoomId() { return activeRoomId; }
  function getActiveRoom() { return rooms.find(r => r.id === activeRoomId) || null; }
  function getRooms() { return rooms; }

  function _bindEvents() {
    // New room button
    document.getElementById('new-room-btn').addEventListener('click', () => {
      document.getElementById('new-room-modal').classList.add('active');
      document.getElementById('room-name-input').focus();
    });

    // Cancel modal
    document.getElementById('cancel-room-btn').addEventListener('click', () => {
      document.getElementById('new-room-modal').classList.remove('active');
    });

    // Create room
    document.getElementById('create-room-btn').addEventListener('click', _createRoom);

    // Close modal on overlay click
    document.getElementById('new-room-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        e.currentTarget.classList.remove('active');
      }
    });
  }

  async function _createRoom() {
    const name = document.getElementById('room-name-input').value.trim();
    const type = document.getElementById('room-type-select').value;
    const description = document.getElementById('room-desc-input').value.trim();

    if (!name) return;

    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, description })
      });

      if (res.ok) {
        const room = await res.json();
        document.getElementById('new-room-modal').classList.remove('active');
        document.getElementById('room-name-input').value = '';
        document.getElementById('room-desc-input').value = '';
        await loadRooms();
        switchRoom(room.id);
      } else {
        const err = await res.json();
        alert('Error: ' + err.error);
      }
    } catch (err) {
      console.error('[rooms] Create failed:', err);
    }
  }

  function _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return { init, loadRooms, switchRoom, getActiveRoomId, getActiveRoom, getRooms };
})();
