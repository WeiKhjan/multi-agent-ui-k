'use strict';

const { createRemoteJWKSet, jwtVerify } = require('jose');

let jwks = null;

/**
 * Initialize JWKS for Cloudflare Access token validation.
 */
function initJWKS(teamDomain) {
  if (teamDomain) {
    jwks = createRemoteJWKSet(
      new URL(`https://${teamDomain}/cdn-cgi/access/certs`)
    );
  }
}

/**
 * Express middleware: authenticate via Cloudflare Access JWT or DEV_MODE bypass.
 */
function authMiddleware(db) {
  return async (req, res, next) => {
    // DEV_MODE bypass
    if (process.env.DEV_MODE === 'true') {
      req.user = {
        id: process.env.DEV_USER_EMAIL || 'dev-user',
        email: process.env.DEV_USER_EMAIL || 'dev@localhost',
        display_name: process.env.DEV_USER_NAME || 'Developer',
        role: process.env.DEV_USER_ROLE || 'owner'
      };

      // Ensure user exists in DB
      _ensureUser(db, req.user);
      return next();
    }

    // Production: validate Cloudflare Access JWT
    const token =
      req.headers['cf-access-jwt-assertion'] ||
      (req.cookies && req.cookies['CF_Authorization']);

    if (!token) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }

    try {
      if (!jwks) {
        initJWKS(process.env.CLOUDFLARE_TEAM_DOMAIN);
      }

      const { payload } = await jwtVerify(token, jwks, {
        audience: process.env.CLOUDFLARE_AUD
      });

      const email = payload.email;
      if (!email) {
        return res.status(401).json({ error: 'No email in token' });
      }

      // Look up user in DB
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user) {
        return res.status(403).json({ error: 'User not registered' });
      }

      req.user = user;
      next();
    } catch (err) {
      console.error('[auth] JWT validation failed:', err.message);
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
  };
}

/**
 * Socket.IO middleware: authenticate WebSocket connections.
 */
function socketAuthMiddleware(db) {
  return (socket, next) => {
    // DEV_MODE bypass
    if (process.env.DEV_MODE === 'true') {
      socket.user = {
        id: 'dev-user',
        email: process.env.DEV_USER_EMAIL || 'dev@localhost',
        display_name: process.env.DEV_USER_NAME || 'Developer',
        role: process.env.DEV_USER_ROLE || 'owner'
      };
      return next();
    }

    // Agent authentication via API key
    const agentKey = socket.handshake.auth.agentApiKey;
    const agentId = socket.handshake.auth.agentId;

    if (agentKey && agentId) {
      // Validate agent key
      const validKeys = {
        vault_agent: process.env.VAULT_AGENT_API_KEY,
        brain_agent: process.env.BRAIN_AGENT_API_KEY
      };

      if (validKeys[agentId] && validKeys[agentId] === agentKey) {
        const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
        if (agent) {
          socket.user = {
            id: agentId,
            display_name: agent.name,
            role: 'agent',
            agentType: agent.type
          };
          socket.isAgent = true;
          return next();
        }
      }
      return next(new Error('Invalid agent credentials'));
    }

    // Human authentication via Cloudflare token
    const token = socket.handshake.auth.cfToken;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    (async () => {
      try {
        if (!jwks) {
          initJWKS(process.env.CLOUDFLARE_TEAM_DOMAIN);
        }

        const { payload } = await jwtVerify(token, jwks, {
          audience: process.env.CLOUDFLARE_AUD
        });

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(payload.email);
        if (!user) {
          return next(new Error('User not registered'));
        }

        socket.user = user;
        next();
      } catch (err) {
        next(new Error('Invalid authentication token'));
      }
    })();
  };
}

/**
 * Ensure a user record exists in the database.
 */
function _ensureUser(db, user) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(user.email);
  if (!existing) {
    db.prepare(`
      INSERT INTO users (id, email, display_name, role)
      VALUES (?, ?, ?, ?)
    `).run(user.id || user.email, user.email, user.display_name, user.role || 'staff');
  }
}

module.exports = { authMiddleware, socketAuthMiddleware, initJWKS };
