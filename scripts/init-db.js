#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

// Load env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'db', 'uik.sqlite');
const dbDir = path.dirname(dbPath);

// Ensure db directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const Database = require('better-sqlite3');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Read and execute schema
const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
db.exec(schema);
console.log('[init-db] Schema applied.');

// Read and execute seed data
const seed = fs.readFileSync(path.join(__dirname, '..', 'db', 'seed.sql'), 'utf8');
db.exec(seed);
console.log('[init-db] Seed data applied.');

// Create dev user if DEV_MODE
if (process.env.DEV_MODE === 'true') {
  const email = process.env.DEV_USER_EMAIL || 'dev@localhost';
  const name = process.env.DEV_USER_NAME || 'Developer';
  const role = process.env.DEV_USER_ROLE || 'owner';

  db.prepare(`
    INSERT OR IGNORE INTO users (id, email, display_name, role)
    VALUES (?, ?, ?, ?)
  `).run('dev-user', email, name, role);

  // Add dev user to all rooms
  const rooms = db.prepare('SELECT id FROM rooms').all();
  const addMember = db.prepare(`
    INSERT OR IGNORE INTO room_members (room_id, user_id, role) VALUES (?, ?, ?)
  `);
  for (const room of rooms) {
    addMember.run(room.id, 'dev-user', 'admin');
  }
  console.log(`[init-db] Dev user created: ${name} (${email}) — role: ${role}`);
}

db.close();
console.log('[init-db] Database initialized at:', dbPath);
