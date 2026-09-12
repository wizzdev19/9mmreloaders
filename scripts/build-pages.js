'use strict';
/**
 * Build for Cloudflare Pages - starts server, exports static, stops.
 * Used as build command in Cloudflare Pages dashboard: node scripts/build-pages.js
 */
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8080;

function waitForServer(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) {
          res.resume();
          resolve();
        } else {
          res.resume();
          if (Date.now() - start > timeout) reject(new Error('Timeout waiting for server'));
          else setTimeout(check, 500);
        }
      }).on('error', () => {
        if (Date.now() - start > timeout) reject(new Error('Timeout waiting for server'));
        else setTimeout(check, 500);
      });
    };
    check();
  });
}

async function main() {
  console.log('Starting server for static export...');
  const auditKey = 'pages-build-' + Date.now();
  const server = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), SITE_ORIGIN: `http://localhost:${PORT}`, NODE_ENV: 'development', REQUIRE_BUSINESS: '0', DEBUG_MODE: '0', AUDIT_KEY: auditKey },
    stdio: 'inherit'
  });

  try {
    await waitForServer(`http://localhost:${PORT}/`, 30000);
    console.log('Server ready, exporting...');
    const exportScript = require('./export-static.js');
    // export-static runs on import? No, it has main() that runs when required? It has main() call at bottom, but we required it after server start
    // Actually export-static's main() is called when file is run directly, not when required. So we need to run it via child process
    const { execSync } = require('child_process');
    execSync('node scripts/export-static.js', { cwd: ROOT, stdio: 'inherit', env: { ...process.env, EXPORT_BASE: `http://localhost:${PORT}`, AUDIT_KEY: auditKey } });
    console.log('Export done');
  } finally {
    console.log('Stopping server...');
    server.kill('SIGTERM');
    // Give it a moment
    await new Promise(r => setTimeout(r, 1000));
    try { server.kill('SIGKILL'); } catch {}
  }
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
