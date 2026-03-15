/**
 * Message UI: rendering messages, agent badges, masking indicators.
 */
const MessageUI = (() => {
  const SENDER_BADGES = {
    human: '\u{1F464}',
    vault_agent: '\u{1F512}',
    brain_agent: '\u{1F9E0}'
  };

  const SENDER_LABELS = {
    vault_agent: 'Vault',
    brain_agent: 'Brain'
  };

  let typingTimeout = null;

  function init() {
    // Listen for new messages
    SocketHandler.on('new_message', _onNewMessage);
    SocketHandler.on('typing', _onTyping);
  }

  async function loadMessages(roomId) {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';

    try {
      const res = await fetch(`/api/rooms/${roomId}/messages`);
      const messages = await res.json();

      for (const msg of messages) {
        _appendMessage(msg);
      }

      _scrollToBottom();
    } catch (err) {
      console.error('[messages] Load failed:', err);
      container.innerHTML = '<div class="message system">Failed to load messages</div>';
    }
  }

  function _onNewMessage(msg) {
    // Only show messages for active room
    if (msg.roomId !== RoomUI.getActiveRoomId()) return;

    _appendMessage(msg);
    _scrollToBottom();
  }

  function _appendMessage(msg) {
    const container = document.getElementById('messages-container');
    const el = document.createElement('div');
    el.className = 'message';

    const time = _formatTime(msg.created_at || msg.createdAt);
    const badge = SENDER_BADGES[msg.sender_type || msg.senderType] || '\u{1F464}';
    const senderName = msg.senderName ||
      SENDER_LABELS[msg.sender_type || msg.senderType] ||
      (msg.sender_id || msg.senderId || 'Unknown');
    const senderType = msg.sender_type || msg.senderType || 'human';
    const wasMasked = msg.wasMasked || msg.was_masked;
    const content = _escapeHtml(msg.content);

    let maskedIcon = '';
    if (wasMasked) {
      maskedIcon = '<span class="masked-indicator" title="Data masked for this room">\u{1F512}</span>';
    }

    el.innerHTML = `
      <span class="timestamp">${time}</span>
      <span class="sender-badge">${badge}</span>
      <span class="sender ${senderType}">${_escapeHtml(senderName)}</span>
      ${maskedIcon}
      <span class="content">${_formatContent(content)}</span>
    `;

    container.appendChild(el);
  }

  function _onTyping(data) {
    if (data.roomId !== RoomUI.getActiveRoomId()) return;

    const indicator = document.getElementById('typing-indicator');
    indicator.textContent = `${data.senderName} is typing...`;

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      indicator.textContent = '';
    }, 3000);
  }

  function _formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `[${h}:${m}]`;
  }

  function _formatContent(text) {
    // Highlight mask tokens like [CLIENT-1], [ACCOUNT-2]
    return text.replace(
      /\[([A-Z_]+-\d+)\]/g,
      '<span style="color: var(--accent-masked); font-weight: bold;">[$1]</span>'
    );
  }

  function _scrollToBottom() {
    const container = document.getElementById('messages-container');
    container.scrollTop = container.scrollHeight;
  }

  function _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return { init, loadMessages };
})();
