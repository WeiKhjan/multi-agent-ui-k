'use strict';

/**
 * Claude API Client: wraps the Anthropic API for reasoning tasks.
 * Supports model selection (Sonnet for speed, Opus for complex reasoning).
 */
class ClaudeClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    this.defaultModel = options.defaultModel || process.env.DEFAULT_MODEL || 'sonnet';
    this.apiUrl = 'https://api.anthropic.com/v1/messages';

    this.modelMap = {
      sonnet: 'claude-sonnet-4-6',
      opus: 'claude-opus-4-6',
      haiku: 'claude-haiku-4-5-20251001'
    };

    // Conversation context per room
    this.contexts = new Map();
  }

  /**
   * Send a message to Claude and get a response.
   * @param {string} prompt - The user/system message
   * @param {Object} options - { model, roomId, systemPrompt, maxTokens }
   * @returns {string} Claude's response text
   */
  async chat(prompt, options = {}) {
    const model = this.modelMap[options.model || this.defaultModel] || this.modelMap.sonnet;
    const roomId = options.roomId || 'default';

    // Get or create conversation context
    if (!this.contexts.has(roomId)) {
      this.contexts.set(roomId, []);
    }
    const context = this.contexts.get(roomId);

    // Add user message to context
    context.push({ role: 'user', content: prompt });

    // Trim context to last 20 messages to manage token usage
    while (context.length > 20) {
      context.shift();
    }

    const systemPrompt = options.systemPrompt || `You are Agent_K-Brain, an AI reasoning assistant for an accounting firm.
You specialize in audit, tax advisory (Malaysian context), MPERS/ISA compliance,
and financial analysis. You work with MASKED data — client names appear as
[CLIENT-A], account numbers as [ACCOUNT-1], etc. This is normal and by design.

Key guidelines:
- Provide professional, detailed analysis
- Reference relevant standards (ISA, MPERS, MFRS, Income Tax Act)
- When you see masked tokens like [CLIENT-A], use them naturally in your response
- Be concise but thorough
- If asked to generate code or workflows, provide complete, working examples`;

    try {
      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens || 4096,
          system: systemPrompt,
          messages: context
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Claude API error ${res.status}: ${err.error?.message || res.statusText}`);
      }

      const data = await res.json();
      const responseText = data.content?.[0]?.text || '[No response]';

      // Add assistant response to context
      context.push({ role: 'assistant', content: responseText });

      return responseText;
    } catch (err) {
      console.error('[claude-client] API call failed:', err.message);
      throw err;
    }
  }

  /**
   * Clear conversation context for a room.
   */
  clearContext(roomId) {
    this.contexts.delete(roomId);
  }

  /**
   * Check if the API key is configured.
   */
  isConfigured() {
    return !!this.apiKey;
  }
}

module.exports = ClaudeClient;
