'use strict';

const patterns = require('./masker-patterns');
const MaskerConfig = require('./masker-config');

/**
 * Core data masking/unmasking engine.
 * Automatically anonymizes sensitive Malaysian financial data while preserving
 * analytical context (amounts, dates, ratios) needed for AI reasoning.
 */
class DataMasker {
  /**
   * @param {Object} options
   * @param {MaskerStore} options.store - Persistence layer for mappings
   * @param {string} options.sessionId - Current session identifier
   * @param {string} [options.clientId] - Active client context
   * @param {MaskerConfig} [options.config] - Masking configuration
   */
  constructor(options = {}) {
    this.store = options.store || null;
    this.sessionId = options.sessionId || 'default';
    this.clientId = options.clientId || null;
    this.config = options.config || new MaskerConfig();

    // In-memory mapping: token → real value
    this.mapping = new Map();
    // Reverse map: real value → token
    this.reverseMap = new Map();
    // Per-type counters for generating sequential tokens
    this.counters = {};

    // Load existing mappings from store if available
    if (this.store) {
      const existing = this.store.getSessionMappings(this.sessionId);
      for (const [token, realValue] of existing) {
        this.mapping.set(token, realValue);
        this.reverseMap.set(realValue, token);
        // Update counter from existing token
        const match = token.match(/\[([A-Z_]+)-(\d+)\]/);
        if (match) {
          const prefix = match[1];
          const num = parseInt(match[2], 10);
          this.counters[prefix] = Math.max(this.counters[prefix] || 0, num);
        }
      }
    }
  }

  /**
   * Mask sensitive data in text before sending to shared rooms.
   * @param {string} text - Raw text with sensitive data
   * @returns {string} Masked text safe for shared rooms
   */
  mask(text) {
    if (!text || typeof text !== 'string') return text;

    let masked = text;

    // Phase 1: Mask known client names (exact match from config)
    masked = this._maskClientNames(masked);

    // Phase 2: Mask known person names (from client contact lists)
    masked = this._maskPersonNames(masked);

    // Phase 3: Apply regex pattern matching
    masked = this._maskPatterns(masked);

    return masked;
  }

  /**
   * Unmask tokens back to real values for local storage.
   * @param {string} text - Text with mask tokens
   * @returns {string} Text with real values restored
   */
  unmask(text) {
    if (!text || typeof text !== 'string') return text;

    let unmasked = text;

    // Replace all tokens with their real values
    const tokenPattern = /\[([A-Z_]+-\d+)\]/g;
    unmasked = unmasked.replace(tokenPattern, (match) => {
      const realValue = this.mapping.get(match);
      return realValue || match; // Return token as-is if no mapping found
    });

    return unmasked;
  }

  /**
   * Get current mapping for audit trail.
   * @returns {Object} Current token-to-value mappings
   */
  getMapping() {
    const result = {};
    for (const [token, value] of this.mapping) {
      result[token] = value;
    }
    return result;
  }

  /**
   * Get the token for a given real value, if it exists.
   * @param {string} realValue
   * @returns {string|null} Token or null
   */
  getToken(realValue) {
    return this.reverseMap.get(realValue) || null;
  }

  // --- Private methods ---

  /**
   * Mask known client names from the config list.
   */
  _maskClientNames(text) {
    const clients = this.config.getClientNames();
    let result = text;

    for (const client of clients) {
      // Match main name
      const names = [client.name, ...(client.aliases || [])];
      for (const name of names) {
        if (!name) continue;
        // Case-insensitive whole-word match
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
        result = result.replace(regex, () => {
          return this._getOrCreateToken(client.name, 'CLIENT', 'client', client.id);
        });
      }
    }

    return result;
  }

  /**
   * Mask known person names from client contact lists.
   */
  _maskPersonNames(text) {
    const persons = this.config.getPersonNames();
    let result = text;

    for (const person of persons) {
      if (!person.name) continue;
      const escaped = person.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      const prefix = (person.role || 'person').toUpperCase().replace(/\s+/g, '');
      result = result.replace(regex, () => {
        return this._getOrCreateToken(person.name, prefix, 'person', person.clientId);
      });
    }

    return result;
  }

  /**
   * Apply regex-based pattern matching for structured data.
   */
  _maskPatterns(text) {
    let result = text;

    // Process patterns in order (more specific first)
    for (const [key, config] of Object.entries(patterns)) {
      // Reset regex lastIndex for global patterns
      config.pattern.lastIndex = 0;

      result = result.replace(config.pattern, (match) => {
        // Run validation if provided
        if (config.validate && !config.validate(match)) {
          return match; // Don't mask if validation fails
        }

        return this._getOrCreateToken(match, config.prefix, config.type);
      });
    }

    return result;
  }

  /**
   * Get existing token for a value or create a new one.
   */
  _getOrCreateToken(realValue, prefix, dataType, clientId) {
    // Check if we already have a token for this value
    const existing = this.reverseMap.get(realValue);
    if (existing) return existing;

    // Create new token
    this.counters[prefix] = (this.counters[prefix] || 0) + 1;
    const token = `[${prefix}-${this.counters[prefix]}]`;

    // Store mapping
    this.mapping.set(token, realValue);
    this.reverseMap.set(realValue, token);

    // Persist to store if available
    if (this.store) {
      this.store.save(this.sessionId, clientId || this.clientId, token, realValue, dataType);
    }

    return token;
  }
}

module.exports = DataMasker;
