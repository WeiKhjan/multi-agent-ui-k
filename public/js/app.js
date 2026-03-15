/**
 * Main App: initializes all modules and binds global events.
 */
(function () {
  'use strict';

  // --- Boot sequence ---
  document.addEventListener('DOMContentLoaded', async () => {
    console.log('[UI_K] Booting terminal...');

    // Initialize modules
    SocketHandler.init();
    MessageUI.init();
    FileHandler.init();
    await RoomUI.init();

    // Bind input events
    _bindInputEvents();
    _bindSearchEvents();
    _bindAgentStatusEvents();

    console.log('[UI_K] Terminal ready.');
  });

  function _bindInputEvents() {
    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');

    // Send on Enter (Shift+Enter for new line)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        _sendMessage();
      }
    });

    // Send button click
    sendBtn.addEventListener('click', _sendMessage);

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 150) + 'px';
    });

    // Typing indicator (throttled)
    let typingTimer = null;
    input.addEventListener('input', () => {
      const roomId = RoomUI.getActiveRoomId();
      if (!roomId || typingTimer) return;
      SocketHandler.sendTyping(roomId);
      typingTimer = setTimeout(() => { typingTimer = null; }, 2000);
    });
  }

  function _sendMessage() {
    const input = document.getElementById('message-input');
    const roomId = RoomUI.getActiveRoomId();
    const content = input.value.trim();

    if (!content || !roomId) return;

    SocketHandler.sendMessage(roomId, content);
    input.value = '';
    input.style.height = 'auto';
    input.focus();
  }

  function _bindSearchEvents() {
    const toggleBtn = document.getElementById('search-toggle-btn');
    const searchBar = document.getElementById('search-bar');
    const searchInput = document.getElementById('search-input');
    const closeBtn = document.getElementById('close-search');

    toggleBtn.addEventListener('click', () => {
      searchBar.classList.toggle('active');
      if (searchBar.classList.contains('active')) {
        searchInput.focus();
      }
    });

    closeBtn.addEventListener('click', () => {
      searchBar.classList.remove('active');
      searchInput.value = '';
    });

    // Search on Enter
    let searchTimeout = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => _performSearch(searchInput.value), 300);
    });
  }

  async function _performSearch(query) {
    const roomId = RoomUI.getActiveRoomId();
    if (!roomId || !query.trim()) {
      // If empty, reload normal messages
      if (roomId) MessageUI.loadMessages(roomId);
      return;
    }

    try {
      const res = await fetch(`/api/rooms/${roomId}/search?q=${encodeURIComponent(query)}`);
      const results = await res.json();

      const container = document.getElementById('messages-container');
      container.innerHTML = '';

      if (results.length === 0) {
        container.innerHTML = '<div class="message system">No results found</div>';
        return;
      }

      container.innerHTML = `<div class="message system">Found ${results.length} result(s)</div>`;
      for (const msg of results) {
        // Re-use message rendering (create temp message-like object)
        const el = document.createElement('div');
        el.className = 'message';
        const time = msg.created_at ? new Date(msg.created_at).toLocaleString() : '';
        el.innerHTML = `
          <span class="timestamp" style="font-size: 12px;">${time}</span>
          <span class="sender ${msg.sender_type}">${msg.sender_id}</span>
          <span class="content">${_escapeHtml(msg.content)}</span>
        `;
        container.appendChild(el);
      }
    } catch (err) {
      console.error('[search] Failed:', err);
    }
  }

  function _bindAgentStatusEvents() {
    SocketHandler.on('agent_status', (data) => {
      _updateAgentDot(data.agentId, data.status);
    });

    // Initial load
    fetch('/api/agents')
      .then(res => res.json())
      .then(agents => {
        for (const agent of agents) {
          _updateAgentDot(agent.id, agent.status);
        }
      })
      .catch(() => {});
  }

  function _updateAgentDot(agentId, status) {
    const prefix = agentId === 'vault_agent' ? 'vault' : 'brain';
    const dot = document.getElementById(`${prefix}-dot`);
    const text = document.getElementById(`${prefix}-status-text`);

    if (dot) {
      dot.className = `dot ${status}`;
    }
    if (text) {
      text.textContent = status;
    }
  }

  function _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
