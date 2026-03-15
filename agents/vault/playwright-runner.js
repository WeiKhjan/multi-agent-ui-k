'use strict';

const { execFile } = require('child_process');
const path = require('path');
const CredentialStore = require('./credential-store');

/**
 * Playwright Script Runner: executes pre-built automation scripts
 * with credential injection from the credential vault.
 */
class PlaywrightRunner {
  constructor() {
    this.credentialStore = new CredentialStore();
    this.scriptsDir = path.join(__dirname, '..', '..', 'automations');
  }

  /**
   * Run a Playwright script by ID.
   * Credentials are injected as environment variables, never written to disk.
   *
   * @param {Object} script - Script record from database
   * @param {Object} params - Runtime parameters
   * @returns {Object} { success, output, error }
   */
  async run(script, params = {}) {
    const scriptPath = path.resolve(this.scriptsDir, script.script_path);

    // Validate script path is within automations directory
    if (!scriptPath.startsWith(path.resolve(this.scriptsDir))) {
      return { success: false, error: 'Script path outside allowed directory' };
    }

    // Inject required credentials as environment variables
    const env = { ...process.env };
    if (script.required_credentials) {
      const credKeys = JSON.parse(script.required_credentials);
      for (const key of credKeys) {
        const value = await this.credentialStore.get(key);
        if (!value) {
          return { success: false, error: `Missing credential: ${key}` };
        }
        env[`CRED_${key.toUpperCase()}`] = value;
      }
    }

    // Add runtime parameters
    env.SCRIPT_PARAMS = JSON.stringify(params);

    return new Promise((resolve) => {
      const child = execFile('node', [scriptPath], {
        env,
        timeout: 120000, // 2 minute timeout
        maxBuffer: 5 * 1024 * 1024 // 5MB output buffer
      }, (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            output: stdout,
            error: error.message + (stderr ? '\n' + stderr : '')
          });
        } else {
          resolve({
            success: true,
            output: stdout,
            error: null
          });
        }
      });
    });
  }

  /**
   * List available automation scripts.
   */
  async listScripts(db) {
    return db.prepare('SELECT id, name, description FROM automation_scripts').all();
  }
}

module.exports = PlaywrightRunner;
