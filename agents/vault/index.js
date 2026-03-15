#!/usr/bin/env node
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { io: ioClient } = require('socket.io-client');
const IntentParser = require('./intent-parser');
const N8nBridge = require('./n8n-bridge');
const PlaywrightRunner = require('./playwright-runner');

/**
 * Agent_K-Vault: Local LLM agent process.
 * Runs on Mac 2 (The Vault) alongside the UI_K server.
 * Has access to client files, credentials, n8n, Ollama.
 */

const SERVER_URL = process.env.UIK_SERVER_URL || 'http://localhost:3000';
const API_KEY = process.env.VAULT_AGENT_API_KEY;
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const THINKING_MODEL = process.env.OLLAMA_MODEL_THINKING || 'qwen3:32b';

// --- Services ---
const intentParser = new IntentParser();
const n8nBridge = new N8nBridge();
const playwrightRunner = new PlaywrightRunner();

// --- Socket Connection ---
let socket = null;
let joinedRooms = new Set();

function connect() {
  console.log(`[vault] Connecting to UI_K at ${SERVER_URL}...`);

  socket = ioClient(SERVER_URL, {
    auth: {
      agentId: 'vault_agent',
      agentApiKey: API_KEY
    },
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000
  });

  socket.on('connect', async () => {
    console.log('[vault] Connected to UI_K server');
    socket.emit('agent_status_update', { status: 'online' });

    // Fetch and join available rooms
    await joinRooms();
  });

  socket.on('disconnect', (reason) => {
    console.log('[vault] Disconnected:', reason);
    joinedRooms.clear();
  });

  // Handle incoming messages (from humans or Brain)
  socket.on('new_message', async (msg) => {
    // Ignore own messages
    if (msg.senderId === 'vault_agent') return;

    // Check if message mentions vault or is a command
    if (_shouldRespond(msg)) {
      await handleMessage(msg);
    }
  });

  // Handle task assignments
  socket.on('task_assigned', async (task) => {
    console.log(`[vault] Task assigned: ${task.task_type} (#${task.id})`);
    await handleTask(task);
  });

  socket.on('error_msg', (data) => {
    console.error('[vault] Error:', data.error);
  });

  socket.on('connect_error', (err) => {
    console.error('[vault] Connection error:', err.message);
  });
}

async function joinRooms() {
  try {
    const res = await fetch(`${SERVER_URL}/api/rooms`, {
      headers: { 'Content-Type': 'application/json' }
    });
    const rooms = await res.json();

    for (const room of rooms) {
      socket.emit('join_room', { roomId: room.id });
      joinedRooms.add(room.id);
      console.log(`[vault] Joined room: ${room.name} (${room.type})`);
    }
  } catch (err) {
    console.error('[vault] Failed to load rooms:', err.message);
  }
}

/**
 * Determine if the vault agent should respond to a message.
 */
function _shouldRespond(msg) {
  const content = (msg.content || '').toLowerCase();

  // Respond to @vault mentions
  if (content.includes('@vault')) return true;

  // Respond to direct commands
  if (content.startsWith('/')) return true;

  // In vault/client rooms, respond to all messages
  // (We'd need room type info here — simplified for now)
  return false;
}

/**
 * Handle an incoming message.
 */
async function handleMessage(msg) {
  socket.emit('agent_status_update', { status: 'processing' });

  try {
    // Parse intent
    const intent = await intentParser.parse(msg.content);
    console.log(`[vault] Intent: ${intent.intent} (confidence: ${intent.confidence})`);

    let response;

    switch (intent.intent) {
      case 'bank_recon':
        response = await handleBankRecon(intent.parameters, msg.roomId);
        break;
      case 'receipt_ocr':
        response = await handleReceiptOcr(intent.parameters, msg.roomId);
        break;
      case 'casting_check':
        response = await handleCastingCheck(intent.parameters, msg.roomId);
        break;
      case 'workflow_trigger':
        response = await handleWorkflowTrigger(intent.parameters, msg.roomId);
        break;
      case 'status_check':
        response = await handleStatusCheck(msg.roomId);
        break;
      default:
        // For chat and unrecognized intents, use the thinking model
        response = await generateResponse(msg.content);
    }

    // Send response
    if (response) {
      socket.emit('send_message', {
        roomId: msg.roomId,
        content: response
      });
    }
  } catch (err) {
    console.error('[vault] Message handling error:', err);
    socket.emit('send_message', {
      roomId: msg.roomId,
      content: `[ERROR] Failed to process: ${err.message}`
    });
  }

  socket.emit('agent_status_update', { status: 'online' });
}

/**
 * Handle a task assignment.
 */
async function handleTask(task) {
  socket.emit('agent_status_update', { status: 'processing' });

  try {
    let result;
    const params = JSON.parse(task.parameters || '{}');

    switch (task.task_type) {
      case 'n8n_workflow':
        result = await n8nBridge.trigger(params.webhookPath, params.data);
        break;
      case 'playwright':
        result = await playwrightRunner.run(params.script, params.data);
        break;
      case 'llm_query':
        result = { response: await generateResponse(params.prompt) };
        break;
      default:
        result = { error: `Unknown task type: ${task.task_type}` };
    }

    socket.emit('task_result', {
      taskId: task.id,
      status: result.error ? 'failed' : 'completed',
      result: JSON.stringify(result)
    });
  } catch (err) {
    socket.emit('task_result', {
      taskId: task.id,
      status: 'failed',
      result: JSON.stringify({ error: err.message })
    });
  }

  socket.emit('agent_status_update', { status: 'online' });
}

/**
 * Generate a response using the thinking model (Qwen3-32B).
 */
async function generateResponse(prompt) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: THINKING_MODEL,
        prompt,
        system: `You are Agent_K-Vault, a local AI assistant for an accounting firm.
You have access to client files, financial data, and automation workflows.
Be concise and professional. Format responses clearly.
When you identify sensitive data in your response, note it — the system
will automatically mask it before sharing with external agents.`,
        stream: false,
        options: { temperature: 0.3, num_predict: 2000 }
      })
    });

    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
    const data = await res.json();
    return data.response || '[No response generated]';
  } catch (err) {
    return `[Vault LLM unavailable: ${err.message}]`;
  }
}

// --- Workflow Handlers ---

async function handleBankRecon(params, roomId) {
  try {
    const result = await n8nBridge.bankReconciliation(params);
    return `Bank reconciliation completed:\n${JSON.stringify(result, null, 2)}`;
  } catch (err) {
    return `Bank reconciliation failed: ${err.message}`;
  }
}

async function handleReceiptOcr(params, roomId) {
  try {
    const result = await n8nBridge.receiptOcr(params);
    return `Receipt processed:\n${JSON.stringify(result, null, 2)}`;
  } catch (err) {
    return `Receipt OCR failed: ${err.message}`;
  }
}

async function handleCastingCheck(params, roomId) {
  try {
    const result = await n8nBridge.castingCheck(params);
    return `Casting check completed:\n${JSON.stringify(result, null, 2)}`;
  } catch (err) {
    return `Casting check failed: ${err.message}`;
  }
}

async function handleWorkflowTrigger(params, roomId) {
  if (!params.webhookPath) {
    return 'Please specify the workflow webhook path.';
  }
  try {
    const result = await n8nBridge.trigger(params.webhookPath, params.data || {});
    return `Workflow completed:\n${JSON.stringify(result, null, 2)}`;
  } catch (err) {
    return `Workflow trigger failed: ${err.message}`;
  }
}

async function handleStatusCheck(roomId) {
  const ollamaOk = await intentParser.isAvailable();
  const n8nOk = await n8nBridge.healthCheck();

  return `System Status:
  Vault Agent: online
  Ollama: ${ollamaOk ? 'available' : 'unavailable'}
  n8n: ${n8nOk ? 'available' : 'unavailable'}`;
}

// --- Start ---
console.log(`
╔══════════════════════════════════════╗
║      Agent_K-Vault Starting...       ║
╚══════════════════════════════════════╝
`);

connect();
