'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Loads and manages per-client masking configuration.
 * Client names and custom rules loaded from config files.
 */
class MaskerConfig {
  constructor(configDir) {
    this.configDir = configDir || path.join(__dirname, '..', 'config');
    this.clientNames = [];
    this.personNames = [];
    this.customRules = {};
    this.reload();
  }

  /**
   * Reload configuration from disk
   */
  reload() {
    this.clientNames = this._loadJson('clients.json', []);
    this.customRules = this._loadJson('masking-rules.json', {});

    // Build person name list from client contacts
    this.personNames = [];
    for (const client of this.clientNames) {
      if (client.contacts) {
        for (const contact of client.contacts) {
          this.personNames.push({
            name: contact.name,
            role: contact.role || 'person',
            clientId: client.id
          });
        }
      }
    }
  }

  /**
   * Get all client names for matching
   * @returns {Array<{id: string, name: string, aliases: string[]}>}
   */
  getClientNames() {
    return this.clientNames;
  }

  /**
   * Get all person names for matching
   * @returns {Array<{name: string, role: string, clientId: string}>}
   */
  getPersonNames() {
    return this.personNames;
  }

  /**
   * Get custom masking rules for a specific client
   * @param {string} clientId
   * @returns {Object} Client-specific masking overrides
   */
  getClientRules(clientId) {
    return this.customRules[clientId] || {};
  }

  _loadJson(filename, defaultValue) {
    const filePath = path.join(this.configDir, filename);
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (err) {
      console.error(`[masker-config] Failed to load ${filename}:`, err.message);
    }
    return defaultValue;
  }
}

module.exports = MaskerConfig;
