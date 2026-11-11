import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateConfig, deviceUrl, readConfig, saveConfig, removeConfig } from '../src/config.mjs';

const deviceId = '11111111-1111-4111-8111-111111111111';
test('validasi hanya origin HTTP/HTTPS dan UUID', () => {
  const config = validateConfig({ origin: ' http://localhost:5173/ ', deviceId });
  assert.equal(deviceUrl(config), `http://localhost:5173/device/${deviceId}`);
  for (const origin of ['file:///abc', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com?x', 'https://example.com#x']) {
    assert.throws(() => validateConfig({ origin, deviceId }));
  }
  assert.throws(() => validateConfig({ origin: 'https://example.com', deviceId: 'wrong' }));
});
test('konfigurasi persisten, rusak dan reset tanpa token di file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'signage-config-'));
  const path = join(dir, 'config.json');
  try {
    assert.equal((await readConfig(path)).config, null);
    await saveConfig(path, { origin: 'https://example.com', deviceId, token: 'never-save' });
    assert.deepEqual((await readConfig(path)).config, { origin: 'https://example.com', deviceId });
    await writeFile(path, '{bad-json');
    assert.match((await readConfig(path)).notice, /tidak dapat dibaca/);
    await removeConfig(path);
    assert.equal((await readConfig(path)).config, null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
