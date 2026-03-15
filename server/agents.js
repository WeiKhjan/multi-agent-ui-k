'use strict';

/**
 * Agent Connection Manager: tracks agent WebSocket connections and status.
 */
class AgentManager {
  constructor(db) {
    this.db = db;
    this.connections = new Map(); // agentId → socket

    this.stmtUpdateStatus = this.db.prepare(`
      UPDATE agents SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?
    `);
    this.stmtGetAgent = this.db.prepare('SELECT * FROM agents WHERE id = ?');
    this.stmtListAgents = this.db.prepare('SELECT * FROM agents');
  }

  /**
   * Register an agent socket connection.
   */
  connect(agentId, socket) {
    this.connections.set(agentId, socket);
    this.stmtUpdateStatus.run('online', agentId);
    console.log(`[agents] ${agentId} connected`);
  }

  /**
   * Handle agent disconnection.
   */
  disconnect(agentId) {
    this.connections.delete(agentId);
    this.stmtUpdateStatus.run('offline', agentId);
    console.log(`[agents] ${agentId} disconnected`);
  }

  /**
   * Update agent status (online, processing, offline).
   */
  setStatus(agentId, status) {
    this.stmtUpdateStatus.run(status, agentId);
  }

  /**
   * Get agent socket for direct messaging.
   */
  getSocket(agentId) {
    return this.connections.get(agentId) || null;
  }

  /**
   * Check if an agent is connected.
   */
  isOnline(agentId) {
    return this.connections.has(agentId);
  }

  /**
   * Get all agents with their current status.
   */
  listAgents() {
    const agents = this.stmtListAgents.all();
    // Override with live connection status
    for (const agent of agents) {
      if (this.connections.has(agent.id)) {
        agent.status = 'online';
      }
    }
    return agents;
  }

  /**
   * Get a specific agent's info.
   */
  getAgent(agentId) {
    return this.stmtGetAgent.get(agentId);
  }
}

module.exports = AgentManager;
