'use strict';

/**
 * SQLite persistence for mask mappings.
 * Stores token-to-real-value mappings per session for audit trail and unmask.
 */
class MaskerStore {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmtInsert = this.db.prepare(`
      INSERT INTO mask_mappings (session_id, client_id, token, real_value, data_type)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.stmtGetBySession = this.db.prepare(`
      SELECT token, real_value, data_type FROM mask_mappings
      WHERE session_id = ? ORDER BY created_at ASC
    `);

    this.stmtGetByToken = this.db.prepare(`
      SELECT real_value FROM mask_mappings
      WHERE session_id = ? AND token = ?
    `);

    this.stmtDeleteSession = this.db.prepare(`
      DELETE FROM mask_mappings WHERE session_id = ?
    `);
  }

  /**
   * Save a mask mapping
   */
  save(sessionId, clientId, token, realValue, dataType) {
    this.stmtInsert.run(sessionId, clientId, token, realValue, dataType);
  }

  /**
   * Get all mappings for a session
   * @returns {Map<string, string>} token → real value
   */
  getSessionMappings(sessionId) {
    const rows = this.stmtGetBySession.all(sessionId);
    const map = new Map();
    for (const row of rows) {
      map.set(row.token, row.real_value);
    }
    return map;
  }

  /**
   * Look up a single token
   */
  getRealValue(sessionId, token) {
    const row = this.stmtGetByToken.get(sessionId, token);
    return row ? row.real_value : null;
  }

  /**
   * Clear all mappings for a session
   */
  clearSession(sessionId) {
    this.stmtDeleteSession.run(sessionId);
  }
}

module.exports = MaskerStore;
