# Multi-Agent UI_K: Vault & Reasoning

## Project Context
This is a self-hosted multi-agent chat platform for accounting professionals.
Two Mac Minis communicate through this UI — a "Vault" (local LLM, handles
sensitive data) and a "Brain" (Claude API, handles complex reasoning).

The critical feature is AUTOMATED DATA MASKING: when the Vault agent posts
to shared rooms, sensitive data (client names, account numbers, IC numbers)
is automatically replaced with tokens like [CLIENT-A], [ACCOUNT-1]. The Brain
agent only ever sees masked data. Real data is only visible in Vault-only rooms.

## Tech Stack
- Node.js + Express + Socket.IO
- SQLite (better-sqlite3) — zero config, file-based
- Vanilla JS frontend (8-bit retro terminal theme)
- Ollama API for local LLM (Qwen3-32B, Qwen3-8B)
- Anthropic API for Claude (Brain agent on Mac 1)
- Cloudflare Tunnel + Cloudflare Access for auth

## Key Principles
1. SECURITY FIRST: Masking happens server-side, never client-side.
2. SIMPLE: No React, no build step. Vanilla JS + HTML + CSS.
3. MALAYSIAN CONTEXT: IC numbers, RM currency, SSM registration formats.
4. TWO AGENT TYPES: Vault (local, has files) and Brain (cloud, masked only).

## Room Types
- vault — Real data. Brain agent BLOCKED.
- shared — Auto-masked data. Both agents.
- ops — No client data. Both agents.
- client — Real data, per-client. Brain BLOCKED.

## Commands
- `npm run dev` — Start server in dev mode (auth bypass)
- `npm run init-db` — Initialize SQLite database
- `npm run vault` — Start Vault agent
- `npm run brain` — Start Brain agent

## What NOT to Do
- Never use React or any frontend framework
- Never hardcode credentials
- Never allow Brain agent to join vault/client rooms
- Never skip masking for shared room messages
