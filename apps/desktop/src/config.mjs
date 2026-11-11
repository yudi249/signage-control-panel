import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

export function validateConfig(value) {
  if (!value || typeof value.origin !== 'string' || typeof value.deviceId !== 'string') {
    throw new Error('Alamat web dan ID Device wajib diisi.');
  }
  let url;
  try { url = new URL(value.origin.trim()); } catch { throw new Error('Alamat web tidak valid.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash || /[?#]/.test(value.origin)) {
    throw new Error('Gunakan origin HTTP/HTTPS tanpa kredensial, subpath, query, atau fragment.');
  }
  const deviceId = value.deviceId.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId)) {
    throw new Error('ID Device harus berupa UUID.');
  }
  return { origin: url.origin, deviceId };
}

export function deviceUrl(config) {
  return `${config.origin}/device/${config.deviceId}`;
}

export async function readConfig(path) {
  try { return { config: validateConfig(JSON.parse(await readFile(path, 'utf8'))), notice: '' }; }
  catch (error) {
    return { config: null, notice: error.code === 'ENOENT' ? '' : 'Konfigurasi tidak dapat dibaca. Silakan pasangkan ulang.' };
  }
}

export async function saveConfig(path, value) {
  const config = validateConfig(value);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(config), 'utf8');
  await rename(`${path}.tmp`, path);
  return config;
}

export async function removeConfig(path) {
  await rm(path, { force: true });
}
