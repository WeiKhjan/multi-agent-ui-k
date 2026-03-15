'use strict';

/**
 * n8n Webhook Bridge: triggers n8n workflows and handles results.
 */
class N8nBridge {
  constructor(baseUrl) {
    this.baseUrl = baseUrl || process.env.N8N_WEBHOOK_BASE || 'http://localhost:5678';
  }

  /**
   * Trigger an n8n workflow via webhook.
   * @param {string} webhookPath - The webhook path (e.g., '/webhook/bank-recon')
   * @param {Object} payload - Data to send to the workflow
   * @returns {Object} Workflow result
   */
  async trigger(webhookPath, payload = {}) {
    const url = `${this.baseUrl}${webhookPath}`;
    console.log(`[n8n] Triggering workflow: ${url}`);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`n8n webhook failed: ${res.status} ${res.statusText}`);
      }

      const result = await res.json();
      console.log(`[n8n] Workflow completed:`, result.status || 'ok');
      return result;
    } catch (err) {
      console.error(`[n8n] Workflow trigger failed:`, err.message);
      throw err;
    }
  }

  /**
   * Check if n8n is reachable.
   */
  async healthCheck() {
    try {
      const res = await fetch(`${this.baseUrl}/healthz`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Common workflow shortcuts.
   */
  async bankReconciliation(params) {
    return this.trigger('/webhook/bank-recon', params);
  }

  async receiptOcr(params) {
    return this.trigger('/webhook/receipt-ocr', params);
  }

  async castingCheck(params) {
    return this.trigger('/webhook/casting-check', params);
  }

  async xbrlGenerate(params) {
    return this.trigger('/webhook/xbrl-generate', params);
  }
}

module.exports = N8nBridge;
