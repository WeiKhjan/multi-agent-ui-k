'use strict';

const { execSync } = require('child_process');
const os = require('os');

/**
 * Credential Store: secure access to credentials.
 * Supports macOS Keychain (production) and environment variables (dev/fallback).
 */
class CredentialStore {
  constructor() {
    this.isMac = os.platform() === 'darwin';
    this.serviceName = 'multi-agent-uik';
  }

  /**
   * Get a credential by key.
   * Checks environment variables first, then macOS Keychain.
   */
  async get(key) {
    // Environment variable override (highest priority)
    const envKey = `CRED_${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
    if (process.env[envKey]) {
      return process.env[envKey];
    }

    // macOS Keychain
    if (this.isMac) {
      try {
        const result = execSync(
          `security find-generic-password -s "${this.serviceName}" -a "${key}" -w 2>/dev/null`,
          { encoding: 'utf8' }
        ).trim();
        return result || null;
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Store a credential.
   */
  async set(key, value) {
    if (this.isMac) {
      try {
        // Delete existing entry first (ignore errors)
        try {
          execSync(
            `security delete-generic-password -s "${this.serviceName}" -a "${key}" 2>/dev/null`
          );
        } catch { /* ignore */ }

        execSync(
          `security add-generic-password -s "${this.serviceName}" -a "${key}" -w "${value}"`
        );
        return true;
      } catch (err) {
        console.error(`[credential-store] Failed to set ${key}:`, err.message);
        return false;
      }
    }

    console.warn(`[credential-store] Cannot persist credential "${key}" — not on macOS`);
    return false;
  }

  /**
   * Delete a credential.
   */
  async delete(key) {
    if (this.isMac) {
      try {
        execSync(
          `security delete-generic-password -s "${this.serviceName}" -a "${key}" 2>/dev/null`
        );
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * List credential keys (not values).
   */
  async list() {
    if (this.isMac) {
      try {
        const result = execSync(
          `security dump-keychain 2>/dev/null | grep -A4 '"${this.serviceName}"' | grep "acct" | sed 's/.*="\\(.*\\)"/\\1/'`,
          { encoding: 'utf8' }
        );
        return result.split('\n').filter(Boolean);
      } catch {
        return [];
      }
    }

    // Fallback: list CRED_ environment variables
    return Object.keys(process.env)
      .filter(k => k.startsWith('CRED_'))
      .map(k => k.replace('CRED_', '').toLowerCase());
  }
}

module.exports = CredentialStore;
