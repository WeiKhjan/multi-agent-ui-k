'use strict';

const path = require('path');
const fs = require('fs');
const multer = require('multer');

/**
 * File handler: local file serving and upload (Mac 2 only).
 * Files NEVER leave Mac 2 — only file references are shared via chat.
 */

const FILE_ROOT = process.env.FILE_STORAGE_ROOT || path.join(__dirname, '..', 'files');

// Ensure file root exists
if (!fs.existsSync(FILE_ROOT)) {
  fs.mkdirSync(FILE_ROOT, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const roomId = req.params.roomId || 'uploads';
    const dest = path.join(FILE_ROOT, roomId);
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    cb(null, dest);
  },
  filename(req, file, cb) {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter(req, file, cb) {
    // Block executable and script files
    const blocked = [
      '.exe', '.bat', '.cmd', '.sh', '.ps1', '.msi', '.com',
      '.vbs', '.vbe', '.wsf', '.wsh', '.scr', '.pif',
      '.jar', '.cgi', '.dll', '.so', '.dylib'
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (blocked.includes(ext)) {
      return cb(new Error('File type not allowed'));
    }
    cb(null, true);
  }
});

/**
 * Serve a local file with path traversal protection.
 */
function serveFile(req, res) {
  const filePath = req.params[0]; // Capture the rest of the path
  const fullPath = path.resolve(FILE_ROOT, filePath);

  // Path traversal protection
  if (!fullPath.startsWith(path.resolve(FILE_ROOT))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.sendFile(fullPath);
}

/**
 * Handle file upload to a room's folder.
 */
function handleUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  res.json({
    fileName: req.file.originalname,
    filePath: path.relative(FILE_ROOT, req.file.path),
    size: req.file.size
  });
}

module.exports = { upload, serveFile, handleUpload, FILE_ROOT };
