'use strict';

/**
 * Intent Parser: uses Ollama (Qwen3-8B fast model) to extract
 * structured intents from natural language user messages.
 */
class IntentParser {
  constructor(options = {}) {
    this.ollamaUrl = options.ollamaUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = options.model || process.env.OLLAMA_MODEL_FAST || 'qwen3:8b';
  }

  /**
   * Parse a user message into a structured intent.
   * @param {string} message - User's natural language message
   * @returns {Object} { intent, parameters, confidence, response }
   */
  async parse(message) {
    const systemPrompt = `You are an intent parser for an accounting automation system.
Given a user message, extract the intent and parameters as JSON.

Available intents:
- chat: General conversation, questions, or discussion
- bank_recon: Bank reconciliation request
- receipt_ocr: Receipt/invoice scanning
- casting_check: Financial statement casting check
- file_process: Process a file (Excel, PDF, CSV)
- xbrl_generate: Generate XBRL/MBRS files
- payroll: Payroll processing
- tax_calc: Tax calculation (CP204, SST)
- workflow_trigger: Trigger a specific n8n workflow
- playwright_run: Run an automation script
- status_check: Check task or system status
- search: Search for information in files/data

Respond with ONLY valid JSON:
{
  "intent": "intent_name",
  "parameters": { ... },
  "confidence": 0.0-1.0,
  "response": "Brief acknowledgment to show the user"
}`;

    try {
      const res = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: message,
          system: systemPrompt,
          stream: false,
          options: {
            temperature: 0.1,
            num_predict: 500
          }
        })
      });

      if (!res.ok) {
        throw new Error(`Ollama API error: ${res.status}`);
      }

      const data = await res.json();
      const text = data.response || '';

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          intent: parsed.intent || 'chat',
          parameters: parsed.parameters || {},
          confidence: parsed.confidence || 0.5,
          response: parsed.response || ''
        };
      }

      // Fallback: treat as chat
      return {
        intent: 'chat',
        parameters: {},
        confidence: 0.3,
        response: text.trim()
      };
    } catch (err) {
      console.error('[intent-parser] Parse failed:', err.message);
      return {
        intent: 'chat',
        parameters: {},
        confidence: 0,
        response: '',
        error: err.message
      };
    }
  }

  /**
   * Check if Ollama is available.
   */
  async isAvailable() {
    try {
      const res = await fetch(`${this.ollamaUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }
}

module.exports = IntentParser;
