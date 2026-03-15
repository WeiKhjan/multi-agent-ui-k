#!/usr/bin/env node
'use strict';

const path = require('path');

// Load brain-specific env first, then fallback to shared env
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.brain') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const WSClient = require('./ws-client');
const ClaudeClient = require('./claude-client');

/**
 * Agent_K-Brain: Cloud-powered reasoning agent.
 * Runs on Mac 1 (The Brain). Connects to UI_K on Mac 2 via WebSocket.
 * Calls Claude API for complex reasoning. ONLY sees masked data.
 */

const claude = new ClaudeClient();
const ws = new WSClient();

// Track which rooms we're in
const roomTypes = new Map();

ws.on('connected', async () => {
  console.log('[brain] Connected. Fetching rooms...');

  // Fetch available rooms (only shared + ops will be returned)
  try {
    const serverUrl = process.env.UIK_SERVER_URL || 'http://localhost:3000';
    const res = await fetch(`${serverUrl}/api/rooms`);
    const rooms = await res.json();

    for (const room of rooms) {
      ws.joinRoom(room.id);
      roomTypes.set(room.id, room.type);
      console.log(`[brain] Joined room: ${room.name} (${room.type})`);
    }
  } catch (err) {
    console.error('[brain] Failed to fetch rooms:', err.message);
  }
});

ws.on('new_message', async (msg) => {
  // Ignore own messages
  if (msg.senderId === 'brain_agent') return;

  // Check if should respond
  if (!_shouldRespond(msg)) return;

  console.log(`[brain] Processing message from ${msg.senderName} in ${msg.roomId}`);
  ws.setStatus('processing');
  ws.sendTyping(msg.roomId);

  try {
    // Determine model based on message complexity or explicit request
    let model = 'sonnet';
    const content = msg.content.toLowerCase();
    if (content.includes('@brain:opus') || content.includes('/opus')) {
      model = 'opus';
    }

    // Clean the @brain mention from the prompt
    const cleanContent = msg.content
      .replace(/@brain(?::opus)?/gi, '')
      .replace(/^\/opus\s*/i, '')
      .trim();

    const response = await claude.chat(cleanContent, {
      model,
      roomId: msg.roomId,
      maxTokens: 4096
    });

    ws.sendMessage(msg.roomId, response);
  } catch (err) {
    console.error('[brain] Response generation failed:', err.message);
    ws.sendMessage(msg.roomId, `[Brain Error] ${err.message}`);
  }

  ws.setStatus('online');
});

ws.on('error_msg', (data) => {
  console.error('[brain] Server error:', data.error);
});

ws.on('disconnected', (reason) => {
  console.log('[brain] Will attempt reconnection...');
});

/**
 * Determine if Brain should respond to a message.
 */
function _shouldRespond(msg) {
  const content = (msg.content || '').toLowerCase();

  // Always respond to @brain mentions
  if (content.includes('@brain')) return true;

  // In ops rooms, respond to code-related questions
  const roomType = roomTypes.get(msg.roomId);
  if (roomType === 'ops' && _isCodeQuestion(content)) return true;

  // In shared rooms, respond to analysis/reasoning requests
  if (roomType === 'shared' && _isAnalysisRequest(content)) return true;

  return false;
}

function _isCodeQuestion(content) {
  const keywords = ['code', 'script', 'workflow', 'function', 'debug', 'error', 'how to', 'implement', 'build', 'create'];
  return keywords.some(k => content.includes(k));
}

function _isAnalysisRequest(content) {
  const keywords = ['analyze', 'review', 'check', 'verify', 'assess', 'opinion', 'recommend',
    'compliance', 'isa ', 'mpers', 'audit', 'tax', 'advise', 'draft'];
  return keywords.some(k => content.includes(k));
}

// --- Start ---
console.log(`
╔══════════════════════════════════════╗
║      Agent_K-Brain Starting...       ║
║  Model: ${claude.defaultModel.padEnd(28)}║
║  Configured: ${claude.isConfigured() ? 'YES' : 'NO '}                       ║
╚══════════════════════════════════════╝
`);

if (!claude.isConfigured()) {
  console.error('[brain] WARNING: ANTHROPIC_API_KEY not set. Claude API calls will fail.');
}

ws.connect();
