# Multi-Agent UI_K: Vault & Reasoning

A self-hosted multi-agent chat platform for accounting and finance professionals. Two Mac Minis collaborate through a shared chat UI — a **Vault** (local LLM for sensitive data) and a **Brain** (Claude API for complex reasoning) — connected by an automated data masking layer that ensures client data never reaches the cloud.

```
┌─────────────────────────────────┐
│     Mac 2: "The Vault"          │
│  ┌───────────┐  ┌────────────┐  │
│  │  UI_K     │  │ Agent_K    │  │
│  │  Server   │  │ Vault      │  │
│  │  Express  │  │ Ollama     │  │
│  │  Socket.IO│  │ Qwen3-32B  │  │
│  └─────┬─────┘  └────────────┘  │
│        │  ┌────────────┐        │
│        ├──│ Data Masker│        │
│        │  └────────────┘        │
│  ┌─────┴──────┐  ┌──────────┐  │
│  │  SQLite DB  │  │   n8n    │  │
│  │  Files      │  │ Workflows│  │
│  └─────────────┘  └──────────┘  │
└────────────┬────────────────────┘
             │ WebSocket (masked data only)
┌────────────┴────────────────────┐
│     Mac 1: "The Brain"          │
│  ┌───────────────────────────┐  │
│  │  Agent_K-Brain            │  │
│  │  Claude API (Sonnet/Opus) │  │
│  │  Sees ONLY masked data    │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

## The Problem

Accounting professionals face a dilemma: cloud AI (Claude, GPT) provides superior reasoning for audit judgments and tax advisory, but sending client financial data to cloud APIs raises data sovereignty concerns. Local AI keeps data private but lacks reasoning quality.

**Key insight:** Most sensitive data (client names, account numbers) is *not needed* for AI reasoning. A bank reconciliation variance of RM 43k requires the same audit procedures whether the client is "Kilat Sejadi" or "[CLIENT-A]."

## How It Works

### Data Masking (Server-Side, Mandatory)

When the Vault agent posts to shared rooms, sensitive data is automatically masked:

```
Before masking (Vault room — real data):
  "Kilat Sejadi bank balance RM 2,341,567.80
   from Maybank account 5142-7283-9901.
   Director Ahmad bin Ismail approved."

After masking (Shared room — what Brain sees):
  "[CLIENT-1] bank balance RM 2,341,567.80
   from [ACCOUNT-1].
   [DIRECTOR-1] approved."
```

**Always masked:** Client names, person names, IC numbers, bank accounts, SSM numbers, emails, phone numbers, addresses, invoice numbers.

**Never masked:** Monetary amounts (RM), dates, ratios, percentages, industry terms, accounting categories — Brain needs these for reasoning.

### Room Types

| Room | Data Level | Who Can Access |
|------|-----------|----------------|
| 🔒 Vault | Real data | Vault agent + authorized humans |
| 💬 Shared | Auto-masked | Both agents + humans |
| 🛠️ Ops | No client data | Both agents + humans |
| 📋 Client | Real data, per-client | Vault agent + assigned humans |

**Critical rule:** Agent_K-Brain can *never* join Vault or Client rooms. This is enforced server-side — no client code can bypass it.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Server | Node.js + Express + Socket.IO |
| Database | SQLite (better-sqlite3) |
| Frontend | Vanilla JS, HTML, CSS (8-bit retro terminal) |
| LLM (Vault) | Ollama (Qwen3-32B / Qwen3-8B) |
| LLM (Brain) | Anthropic Claude API |
| Auth | Cloudflare Access (Zero Trust) |
| Tunnel | Cloudflare Tunnel |
| Process Manager | PM2 |

## Quick Start

### Mac 2 (The Vault — Primary Server)

```bash
# Clone and install
git clone https://github.com/WeiKhjan/multi-agent-ui-k.git
cd multi-agent-ui-k
npm install

# Configure
cp .env.example .env
# Edit .env — set your API keys and Cloudflare settings

# Initialize database
npm run init-db

# Start in dev mode (auth bypass for local testing)
npm run dev
# → http://localhost:3000

# Start Vault agent (requires Ollama running)
npm run vault
```

### Mac 1 (The Brain — Reasoning Agent)

```bash
cd multi-agent-ui-k

# Configure
cp .env.brain.example .env.brain
# Edit .env.brain — set ANTHROPIC_API_KEY and UIK_SERVER_URL

# Start Brain agent
npm run brain
```

### Production (PM2)

```bash
pm2 start ecosystem.config.js
```

## Project Structure

```
server/              Express + Socket.IO server
  index.js           Main server entry point
  auth.js            Cloudflare Access JWT + dev bypass
  rooms.js           Room manager with Brain agent isolation
  messages.js        Message handler with auto-masking
  agents.js          Agent connection manager
  files.js           Local file serving

lib/                 Data masking engine
  data-masker.js     Core mask/unmask with mapping persistence
  masker-patterns.js Malaysian regex patterns (IC, phone, SSM, etc.)
  masker-config.js   Per-client masking configuration
  masker-store.js    SQLite persistence for mask mappings

agents/vault/        Agent_K-Vault (runs on Mac 2)
  index.js           Main process — Ollama, n8n, Playwright
  intent-parser.js   LLM-based intent extraction
  n8n-bridge.js      n8n webhook caller
  playwright-runner.js  Script executor with credential injection
  credential-store.js   macOS Keychain / env credential access

agents/brain/        Agent_K-Brain (runs on Mac 1)
  index.js           Main process — Claude API reasoning
  claude-client.js   Anthropic API wrapper (Sonnet/Opus)
  ws-client.js       WebSocket client with reconnection

public/              Frontend (8-bit retro terminal)
  index.html         Chat UI
  css/terminal.css   Green phosphor CRT aesthetic
  js/                Client-side modules

db/                  Database schema and seed data
config/              Client lists, masking rules
scripts/             Setup helpers (Cloudflare, Ollama, backup)
```

## Security

- **Masking is server-side and mandatory.** No client code can bypass masking for shared rooms.
- **Brain agent is blocked from vault/client rooms** at every layer — room manager, WebSocket join, API endpoints.
- **`content_unmasked` is stripped** from all API responses for shared rooms.
- **Files never leave Mac 2.** Only file references (name, size) are shared via chat.
- **Credentials** are accessed via macOS Keychain or environment variables, never stored in the database.
- **Timing-safe comparison** for agent API key validation.
- **Security headers** (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection).
- **CORS restricted** to same-origin in production.

## Configuration

### Client Name Lists

Edit `config/clients.json` to add clients for name masking:

```json
[
  {
    "id": "client-abc",
    "name": "ABC Trading Sdn Bhd",
    "aliases": ["ABC Trading", "ABCT"],
    "contacts": [
      { "name": "Ali bin Abu", "role": "director" }
    ]
  }
]
```

### Environment Variables

See `.env.example` for all options. Key settings:

| Variable | Description |
|----------|-------------|
| `DEV_MODE` | `true` to skip Cloudflare auth (local dev) |
| `VAULT_AGENT_API_KEY` | Shared secret for Vault agent auth |
| `BRAIN_AGENT_API_KEY` | Shared secret for Brain agent auth |
| `OLLAMA_BASE_URL` | Ollama API endpoint (default: localhost:11434) |
| `ANTHROPIC_API_KEY` | Claude API key (Brain agent, Mac 1 only) |

## Scripts

```bash
npm run dev          # Start server in dev mode
npm run init-db      # Initialize SQLite database
npm run vault        # Start Vault agent
npm run brain        # Start Brain agent

# Setup helpers
./scripts/setup-cloudflare.sh   # Cloudflare Tunnel setup
./scripts/setup-ollama.sh       # Pull Ollama models
./scripts/backup.sh             # Backup database + config
```

## License

UNLICENSED — Private project.
