-- Default seed data for Multi-Agent UI_K

-- Default agents
INSERT OR IGNORE INTO agents (id, name, type, status) VALUES
    ('vault_agent', 'Agent_K-Vault', 'vault', 'offline'),
    ('brain_agent', 'Agent_K-Brain', 'brain', 'offline');

-- Default rooms
INSERT OR IGNORE INTO rooms (id, name, type, description) VALUES
    ('ops-general', 'General Ops', 'ops', 'General operations, code, workflows — no client data'),
    ('shared-analysis', 'Shared Analysis', 'shared', 'Collaborative analysis with auto-masked data'),
    ('vault-main', 'Vault Room', 'vault', 'Sensitive data workspace — Brain agent blocked');

-- Add agents to permitted rooms
-- Vault agent: all rooms
INSERT OR IGNORE INTO room_members (room_id, user_id, role) VALUES
    ('ops-general', 'vault_agent', 'member'),
    ('shared-analysis', 'vault_agent', 'member'),
    ('vault-main', 'vault_agent', 'member');

-- Brain agent: shared + ops only (NEVER vault or client)
INSERT OR IGNORE INTO room_members (room_id, user_id, role) VALUES
    ('ops-general', 'brain_agent', 'member'),
    ('shared-analysis', 'brain_agent', 'member');
