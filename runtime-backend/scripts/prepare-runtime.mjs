import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const payloadDir = path.join(root, 'payload');
const expectedSha256 = 'f3cb3c2df7505e61a744cec5d2b82aed391a6b6725f96d49cb0f6748c53acd90';
const expectedFiles = [
  'server.mjs',
  'lib/libvirt-driver.mjs',
  'lib/topology.mjs',
  'test/server.test.mjs',
  'test/topology.test.mjs',
  'scripts/install-ubuntu.sh',
  'deploy/netlab-kvm-runtime.service'
];

const chunks = fs.readdirSync(payloadDir)
  .filter((name) => /^runtime-v1\.1\.0\.0[1-5]\.b64$/.test(name))
  .sort();
if (chunks.length !== 5) throw new Error(`Expected 5 runtime overlay chunks, found ${chunks.length}`);

const base64 = chunks.map((name) => {
  const value = fs.readFileSync(path.join(payloadDir, name), 'utf8').trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error(`Invalid base64 payload: ${name}`);
  return value;
}).join('');
const archive = Buffer.from(base64, 'base64');
const actualHash = crypto.createHash('sha256').update(archive).digest('hex');
if (actualHash !== expectedSha256) {
  throw new Error(`Runtime overlay checksum mismatch: expected ${expectedSha256}, got ${actualHash}`);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netlab-runtime-overlay-'));
const archivePath = path.join(tempDir, 'runtime-v1.1.0.tgz');
try {
  fs.writeFileSync(archivePath, archive, { flag: 'wx', mode: 0o600 });
  const members = execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .trim().split(/\r?\n/).filter(Boolean);
  if (members.length !== expectedFiles.length || expectedFiles.some((name) => !members.includes(name))) {
    throw new Error('Runtime overlay archive has an unexpected file list; refusing extraction.');
  }
  for (const name of members) {
    if (path.isAbsolute(name) || name.split('/').some((part) => part === '..' || part === '')) {
      throw new Error(`Unsafe runtime overlay archive member: ${name}`);
    }
  }
  execFileSync('tar', ['-xzf', archivePath, '-C', root, '--no-same-owner', '--no-same-permissions'], { stdio: 'inherit' });
  console.log(`NetLab runtime overlay v1.1.0 applied (${members.length} allowlisted files; SHA-256 ${actualHash}).`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
