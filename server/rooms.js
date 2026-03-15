'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Room Manager: CRUD operations and permission enforcement.
 * Critical: Enforces that Brain agent NEVER joins vault/client rooms.
 */
class RoomManager {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmtGetRoom = this.db.prepare('SELECT * FROM rooms WHERE id = ?');
    this.stmtListRooms = this.db.prepare('SELECT * FROM rooms ORDER BY created_at ASC');
    this.stmtCreateRoom = this.db.prepare(`
      INSERT INTO rooms (id, name, type, client_id, description, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    this.stmtDeleteRoom = this.db.prepare('DELETE FROM rooms WHERE id = ?');
    this.stmtGetMembers = this.db.prepare(`
      SELECT rm.*, u.display_name, u.email, u.role as user_role
      FROM room_members rm
      LEFT JOIN users u ON rm.user_id = u.id
      WHERE rm.room_id = ?
    `);
    this.stmtIsMember = this.db.prepare(`
      SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?
    `);
    this.stmtAddMember = this.db.prepare(`
      INSERT OR IGNORE INTO room_members (room_id, user_id, role) VALUES (?, ?, ?)
    `);
    this.stmtRemoveMember = this.db.prepare(`
      DELETE FROM room_members WHERE room_id = ? AND user_id = ?
    `);
    this.stmtGetUserRooms = this.db.prepare(`
      SELECT r.* FROM rooms r
      INNER JOIN room_members rm ON r.id = rm.room_id
      WHERE rm.user_id = ?
      ORDER BY r.created_at ASC
    `);
  }

  /**
   * Get rooms accessible by a user (considering role-based access).
   */
  getRoomsForUser(userId, userRole, agentType) {
    // Agents: filter by type
    if (agentType) {
      return this._getAgentRooms(userId, agentType);
    }

    // Owner: can see all rooms
    if (userRole === 'owner') {
      return this.stmtListRooms.all();
    }

    // Others: only rooms they're a member of
    return this.stmtGetUserRooms.all(userId);
  }

  /**
   * Get rooms for an agent, enforcing type restrictions.
   * Brain agent: ONLY shared + ops rooms.
   * Vault agent: all rooms.
   */
  _getAgentRooms(agentId, agentType) {
    if (agentType === 'brain') {
      // Brain NEVER sees vault or client rooms
      return this.db.prepare(`
        SELECT r.* FROM rooms r
        INNER JOIN room_members rm ON r.id = rm.room_id
        WHERE rm.user_id = ? AND r.type IN ('shared', 'ops')
        ORDER BY r.created_at ASC
      `).all(agentId);
    }
    // Vault agent: all their rooms
    return this.stmtGetUserRooms.all(agentId);
  }

  /**
   * Check if a user/agent can access a room.
   * CRITICAL: Brain agent is blocked from vault/client rooms regardless of membership.
   */
  canAccess(roomId, userId, agentType) {
    const room = this.stmtGetRoom.get(roomId);
    if (!room) return false;

    // SECURITY: Brain agent blocked from vault and client rooms
    if (agentType === 'brain' && (room.type === 'vault' || room.type === 'client')) {
      return false;
    }

    // Check membership
    return !!this.stmtIsMember.get(roomId, userId);
  }

  /**
   * Create a new room.
   */
  createRoom(name, type, options = {}) {
    const id = options.id || `${type}-${uuidv4().substring(0, 8)}`;
    this.stmtCreateRoom.run(
      id, name, type,
      options.clientId || null,
      options.description || null,
      options.createdBy || null
    );

    const room = this.stmtGetRoom.get(id);

    // Auto-add agents based on room type
    this._autoAddAgents(id, type);

    // Add creator as admin if specified
    if (options.createdBy) {
      this.stmtAddMember.run(id, options.createdBy, 'admin');
    }

    return room;
  }

  /**
   * Auto-add agents to room based on type.
   */
  _autoAddAgents(roomId, roomType) {
    // Vault agent joins all rooms
    this.stmtAddMember.run(roomId, 'vault_agent', 'member');

    // Brain agent: only shared and ops rooms
    if (roomType === 'shared' || roomType === 'ops') {
      this.stmtAddMember.run(roomId, 'brain_agent', 'member');
    }
  }

  /**
   * Add a member to a room (with Brain agent protection).
   */
  addMember(roomId, userId, role, agentType) {
    const room = this.stmtGetRoom.get(roomId);
    if (!room) throw new Error('Room not found');

    // SECURITY: Prevent Brain agent from being added to vault/client rooms
    if (agentType === 'brain' && (room.type === 'vault' || room.type === 'client')) {
      throw new Error('Brain agent cannot be added to vault or client rooms');
    }

    this.stmtAddMember.run(roomId, userId, role || 'member');
  }

  /**
   * Remove a member from a room.
   */
  removeMember(roomId, userId) {
    this.stmtRemoveMember.run(roomId, userId);
  }

  /**
   * Get room details.
   */
  getRoom(roomId) {
    return this.stmtGetRoom.get(roomId);
  }

  /**
   * Get room members.
   */
  getMembers(roomId) {
    return this.stmtGetMembers.all(roomId);
  }

  /**
   * Delete a room.
   */
  deleteRoom(roomId) {
    this.stmtDeleteRoom.run(roomId);
  }
}

module.exports = RoomManager;
