'use strict';

const DataMasker = require('../lib/data-masker');
const MaskerStore = require('../lib/masker-store');
const MaskerConfig = require('../lib/masker-config');

/**
 * Message Handler: store, retrieve, paginate messages.
 * CRITICAL: Auto-masks messages before broadcasting to shared rooms.
 */
class MessageHandler {
  constructor(db) {
    this.db = db;
    this.maskerConfig = new MaskerConfig();
    this.maskerStore = new MaskerStore(db);

    // Active masker instances per session
    this.maskers = new Map();

    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmtInsert = this.db.prepare(`
      INSERT INTO messages (room_id, sender_id, sender_type, content, content_unmasked, has_file, file_path, file_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmtGetMessages = this.db.prepare(`
      SELECT * FROM messages WHERE room_id = ?
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `);
    this.stmtGetMessage = this.db.prepare('SELECT * FROM messages WHERE id = ?');
    this.stmtSearch = this.db.prepare(`
      SELECT * FROM messages WHERE room_id = ? AND content LIKE ?
      ORDER BY created_at DESC LIMIT ?
    `);
  }

  /**
   * Get or create a DataMasker instance for a session.
   */
  getMasker(sessionId, clientId) {
    const key = `${sessionId}:${clientId || 'default'}`;
    if (!this.maskers.has(key)) {
      this.maskers.set(key, new DataMasker({
        store: this.maskerStore,
        sessionId,
        clientId,
        config: this.maskerConfig
      }));
    }
    return this.maskers.get(key);
  }

  /**
   * Store a message, applying masking for shared rooms.
   *
   * @param {Object} room - Room object with type field
   * @param {string} senderId - Sender user/agent ID
   * @param {string} senderType - 'human', 'vault_agent', or 'brain_agent'
   * @param {string} content - Raw message content
   * @param {Object} [options] - Optional file info
   * @returns {Object} { message, maskedContent, unmaskedContent }
   */
  storeMessage(room, senderId, senderType, content, options = {}) {
    const sessionId = room.client_id || room.id;
    const masker = this.getMasker(sessionId, room.client_id);

    let maskedContent = content;
    let unmaskedContent = null;

    if (room.type === 'shared') {
      // CRITICAL: Auto-mask for shared rooms
      maskedContent = masker.mask(content);
      unmaskedContent = content; // Store original locally
    } else if (room.type === 'vault' || room.type === 'client') {
      // Vault/client rooms: store real data, no masking needed
      unmaskedContent = content;
      maskedContent = content;
    }
    // Ops rooms: no masking (should contain no client data)

    const result = this.stmtInsert.run(
      room.id, senderId, senderType,
      maskedContent, unmaskedContent,
      options.hasFile ? 1 : 0,
      options.filePath || null,
      options.fileName || null
    );

    const message = this.stmtGetMessage.get(result.lastInsertRowid);

    return {
      message,
      maskedContent,
      unmaskedContent,
      wasMasked: room.type === 'shared' && maskedContent !== content
    };
  }

  /**
   * Get messages for a room (paginated, newest first).
   * SECURITY: Strips content_unmasked unless caller is authorized for real data.
   * @param {string} roomId
   * @param {number} limit
   * @param {number} offset
   * @param {Object} options - { includeUnmasked: bool }
   */
  getMessages(roomId, limit = 50, offset = 0, options = {}) {
    const rows = this.stmtGetMessages.all(roomId, limit, offset).reverse();
    if (!options.includeUnmasked) {
      return rows.map(r => this._stripUnmasked(r));
    }
    return rows;
  }

  /**
   * Search messages in a room.
   * SECURITY: Strips content_unmasked unless caller is authorized.
   */
  searchMessages(roomId, query, limit = 20, options = {}) {
    // Escape LIKE wildcards in user input
    const safeQuery = query.replace(/[%_]/g, '\\$&');
    const rows = this.stmtSearch.all(roomId, `%${safeQuery}%`, limit);
    if (!options.includeUnmasked) {
      return rows.map(r => this._stripUnmasked(r));
    }
    return rows;
  }

  /**
   * Strip content_unmasked and file_path from a message row.
   * Only masked content is safe to return to untrusted callers.
   */
  _stripUnmasked(row) {
    const { content_unmasked, file_path, ...safe } = row;
    return safe;
  }

  /**
   * Reload masking configuration (e.g., after client list update).
   */
  reloadConfig() {
    this.maskerConfig.reload();
    this.maskers.clear(); // Force re-creation with new config
  }
}

module.exports = MessageHandler;
