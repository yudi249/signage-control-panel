import { _electron as electron } from 'playwright';
import { createServer } from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const profile = await mkdtemp(join(tmpdir(), 'signage-electron-'));
const deviceId = '11111111-1111-4111-8111-111111111111';
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  if (req.url === '/frame') res.end('<p>External frame</p>');
  else res.end('<h1>Device Client pengujian</h1><iframe src="/frame"></iframe>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let app;
async function launch() {
  app = await electron.launch({ args: [resolve('.')], env: { ...process.env, SIGNAGE_DESKTOP_TEST_PROFILE: profile } });
  return app.firstWindow();
}
try {
  let page = await launch();
  await page.getByRole('heading', { name: 'Pengaturan Device' }).waitFor();
  await page.locator('#origin').fill(origin);
  await page.locator('#deviceId').fill(deviceId);
  await page.getByRole('button', { name: 'Simpan dan buka Device' }).click();
  await page.getByRole('heading', { name: 'Device Client pengujian' }).waitFor();
  assert.equal(page.url(), `${origin}/device/${deviceId}`);
  assert.deepEqual(await page.evaluate(() => ({ node: typeof window.require, desktop: typeof window.desktop })), { node: 'undefined', desktop: 'undefined' });
  await page.locator('iframe').waitFor();
  assert.equal(await page.frames()[1].evaluate(() => typeof window.desktop), 'undefined');
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()), true);
  await page.evaluate(() => localStorage.setItem('device-token:test', 'persistent-test-token'));
  await page.evaluate(() => window.open('https://example.com'));
  await page.waitForTimeout(100);
  assert.equal(app.windows().length, 1);
  await page.evaluate(() => { location.href = '/forbidden'; });
  await page.waitForTimeout(100);
  assert.equal(page.url(), `${origin}/device/${deviceId}`);
  await app.close(); app = null;
  page = await launch();
  await page.getByRole('heading', { name: 'Device Client pengujian' }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('device-token:test')), 'persistent-test-token');
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items[0].submenu.items[0].click());
  await page.getByRole('heading', { name: 'Pengaturan Device' }).waitFor();
  await page.getByRole('button', { name: 'Batal', exact: true }).click();
  await page.getByRole('heading', { name: 'Device Client pengujian' }).waitFor();
  assert.equal((JSON.parse(await readFile(join(profile, 'device-config.json'), 'utf8'))).origin, origin);
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.focus(); win.webContents.focus();
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  });
  await page.waitForTimeout(500);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()), false);
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'F11' });
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'F11' });
  });
  await page.waitForTimeout(500);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()), true);
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items[0].submenu.items[0].click());
  await page.getByRole('heading', { name: 'Pengaturan Device' }).waitFor();
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
  await page.getByRole('button', { name: 'Hapus data pemasangan' }).click();
  await page.waitForTimeout(150);
  assert.equal((JSON.parse(await readFile(join(profile, 'device-config.json'), 'utf8'))).origin, origin);
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
  await page.getByRole('button', { name: 'Hapus data pemasangan' }).click();
  await page.getByRole('status').filter({ hasText: 'Data pemasangan dihapus' }).waitFor();
  await page.locator('#origin').fill(origin);
  await page.locator('#deviceId').fill(deviceId);
  await page.getByRole('button', { name: 'Simpan dan buka Device' }).click();
  await page.getByRole('heading', { name: 'Device Client pengujian' }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('device-token:test')), null);
  await app.close(); app = null;
  await new Promise((resolve) => server.close(resolve));
  page = await launch();
  await page.getByRole('heading', { name: 'Belum terhubung ke halaman web' }).waitFor();
  await page.getByRole('button', { name: 'Pengaturan', exact: true }).click();
  await page.getByRole('heading', { name: 'Pengaturan Device' }).waitFor();
  // Buka pengaturan membatalkan retry otomatis dan tidak mengubah konfigurasi tersimpan.
  assert.equal((JSON.parse(await readFile(join(profile, 'device-config.json'), 'utf8'))).origin, origin);
  console.log('Smoke Electron lulus: konfigurasi, fullscreen/shortcut, isolasi remote/iframe, popup, navigasi, persistensi, batal/reset, dan pemulihan load.');
} finally {
  if (app) await app.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
