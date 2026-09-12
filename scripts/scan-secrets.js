'use strict';
/**
 * Secret scanner.
 *
 * Checks the working tree AND, when a repository is present, every blob in git
 * history. A key that was committed once and deleted later is still leaked, so
 * scanning only the current files is not enough.
 *
 * Usage: npm run audit:secrets
 * Exit code 1 if anything is found, so it can gate a deploy.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set(['node_modules', '.git', 'data', 'coverage', 'dist', 'build', 'tmp']);
const SKIP_FILES = new Set(['.env.example', 'scan-secrets.js', 'package-lock.json']);
const BINARY = /\.(jpe?g|png|gif|webp|ico|db|sqlite|pdf|zip|gz|woff2?|ttf)$/i;

const RULES = [
  { id: 'aws-access-key', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/, note: 'AWS access key id' },
  { id: 'aws-secret', re: /aws_secret_access_key\s*[=:]\s*['"][A-Za-z0-9/+=]{40}['"]/i, note: 'AWS secret access key' },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z\-_]{35}\b/, note: 'Google API key' },
  { id: 'stripe-live', re: /\bsk_live_[0-9a-zA-Z]{16,}\b/, note: 'Stripe live secret key' },
  { id: 'stripe-restricted', re: /\brk_live_[0-9a-zA-Z]{16,}\b/, note: 'Stripe restricted live key' },
  { id: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, note: 'GitHub token' },
  { id: 'slack-token', re: /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/, note: 'Slack token' },
  { id: 'sendgrid', re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/, note: 'SendGrid key' },
  { id: 'private-key', re: /-----BEGIN (RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/, note: 'Private key block' },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, note: 'JSON web token' },
  { id: 'basic-auth-url', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]{6,}@/i, note: 'Credentials embedded in a URL' },
  { id: 'generic-assignment', re: /\b(api[_-]?key|apikey|secret|passwd|password|token|access[_-]?key)\s*[=:]\s*['"][^'"\s${}]{12,}['"]/i, note: 'Hard coded credential assignment' }
];

// Values that look like secrets but are deliberately inert.
const ALLOWLIST = [
  /replace_me_with_64_hex_chars/,
  /PLACEHOLDER/,
  /process\.env\./,
  /example\.com/,
  /your[_-]?(key|token|secret)/i
];

const findings = [];

function scanText(label, text) {
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (line.length > 2000) return;
    if (ALLOWLIST.some((re) => re.test(line))) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        findings.push({ label, line: i + 1, rule: rule.id, note: rule.note, excerpt: line.trim().slice(0, 120) });
      }
    }
  });
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
      continue;
    }
    if (SKIP_FILES.has(entry.name) || BINARY.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full);
    let text;
    try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
    scanText(rel, text);
  }
}

console.log('Scanning working tree ...');
walk(ROOT);

/* ------------------------------------------------------ git history */

let gitScanned = 0;
const hasGit = fs.existsSync(path.join(ROOT, '.git'));
if (hasGit) {
  console.log('Scanning git history ...');
  try {
    const objects = execFileSync('git', ['rev-list', '--objects', '--all'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
      .toString().split('\n').filter(Boolean);
    for (const line of objects) {
      const [sha, name] = line.split(' ');
      if (!name || BINARY.test(name) || SKIP_FILES.has(path.basename(name))) continue;
      if (name.split('/').some((part) => SKIP_DIRS.has(part))) continue;
      let content;
      try {
        content = execFileSync('git', ['cat-file', '-p', sha], { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 }).toString();
      } catch { continue; }
      gitScanned++;
      scanText(`git:${name}@${sha.slice(0, 8)}`, content);
    }
  } catch (err) {
    console.warn('  could not read git history: ' + err.message);
  }
} else {
  console.log('No .git directory found. History scan skipped.');
}

/* --------------------------------------------------- ignore checks */

const problems = [];
const gitignore = fs.existsSync(path.join(ROOT, '.gitignore'))
  ? fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8') : '';
for (const required of ['.env', 'node_modules']) {
  if (!gitignore.split('\n').some((l) => l.trim() === required || l.trim() === required + '/')) {
    problems.push(`.gitignore does not exclude ${required}`);
  }
}
if (hasGit) {
  try {
    const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT }).toString().split('\n');
    for (const f of tracked) {
      if (/^\.env$/.test(f) || /^\.env\.(?!example)/.test(f)) problems.push(`${f} is tracked by git and must be removed from the index`);
      if (/\.(pem|key|p12|pfx)$/.test(f)) problems.push(`${f} is tracked by git and looks like a private key`);
    }
  } catch { /* not a repo */ }
}

/* -------------------------------------------------------- report */

console.log(`\nFiles in history scanned: ${gitScanned}`);
if (!findings.length && !problems.length) {
  console.log('No secrets found and no ignore rules missing.');
  process.exit(0);
}
for (const p of problems) console.error('CONFIG  ' + p);
for (const f of findings) console.error(`SECRET  ${f.label}:${f.line}  [${f.rule}] ${f.note}\n        ${f.excerpt}`);
console.error(`\n${findings.length} possible secret(s), ${problems.length} configuration problem(s).`);
process.exit(1);
