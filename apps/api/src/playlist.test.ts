import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import WebSocket from "ws";
import { buildApp } from "./app.ts";
import { createEventBus } from "./platform/events.ts";
import { AppError } from "./platform/errors.ts";

const AUTH = {
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD_HASH: "$2b$04$WX0Y.QWBAln/wMErhaciGeZKl6h2bkMQ9d769anlyGUNto1lsWQYe", // "adminpass"
  JWT_SECRET: "test-secret-1234567890",
} as const;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
}

function waitForMessage(ws: WebSocket, predicate: (msg: any) => boolean, timeoutMs = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting for message")), timeoutMs);
    const onMessage = (data: WebSocket.RawData) => {
      const msg = JSON.parse(String(data));
      if (predicate(msg)) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve(msg);
      }
    };
    ws.on("message", onMessage);
    ws.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

async function authHeader(app: any): Promise<{ authorization: string }> {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "admin", password: "adminpass" } });
  return { authorization: `Bearer ${res.json().token}` };
}

describe("playlist and sync composition", () => {
  const apps: any[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  function baseSetup() {
    const deviceId = "11111111-1111-4111-8111-111111111111";
    const c1 = { id: "22222222-2222-4222-8222-222222222222", judul: "C1", tipe: "text", payload: "a", createdAt: "2026-11-11T10:00:00.000Z" };
    const c2 = { id: "33333333-3333-4333-8333-333333333333", judul: "C2", tipe: "image", payload: "http://x/img.png", createdAt: "2026-11-11T10:01:00.000Z" };
    const devices = new Map<string, any>([[
      deviceId,
      { id: deviceId, nama: "A", lokasi: "", status: "offline", lastSeen: null, pushedContentId: null, tokenHash: hashToken("dev-token") },
    ]]);
    const contents = new Map<string, any>([[c1.id, c1], [c2.id, c2]]);
    const playlists = new Map<string, Array<{ contentId: string; position: number; durationSeconds: number }>>();
    const devicesService = {
      list: vi.fn(async () => Array.from(devices.values())),
      get: vi.fn(async (id: string) => {
        const d = devices.get(id);
        if (!d) throw new AppError(404, "Device tidak ditemukan");
        return { ...d };
      }),
      findById: vi.fn(async (id: string) => devices.get(id) ?? null),
      setPresence: vi.fn(async (id: string, status: "online" | "offline") => {
        const d = devices.get(id); if (!d) return null;
        d.status = status; d.lastSeen = "2026-11-11T10:00:00.000Z"; return { ...d };
      }),
      setActiveContent: vi.fn(async (id: string, pushedContentId: string | null) => {
        const d = devices.get(id); if (!d) return null;
        d.pushedContentId = pushedContentId; return { ...d };
      }),
    };
    const contentsService = {
      findById: vi.fn(async (id: string) => contents.get(id) ?? null),
      list: vi.fn(async () => Array.from(contents.values())),
    };
    const playlistsService = {
      get: vi.fn(async (id: string) => {
        const d = devices.get(id);
        if (!d) throw new AppError(404, "Device tidak ditemukan");
        const items = playlists.get(id) ?? [];
        return items
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((it) => ({ position: it.position, durationSeconds: it.durationSeconds, content: contents.get(it.contentId) }));
      }),
      replace: vi.fn(async (id: string, body: { items: Array<{ contentId: string; position?: number; durationSeconds?: number }> }) => {
        if (!devices.has(id)) throw new AppError(404, "Device tidak ditemukan");
        const items = body.items ?? [];
        const normalized = items.map((it, idx) => {
          if (!contents.has(it.contentId)) throw new AppError(404, "Content tidak ditemukan");
          const duration = it.durationSeconds ?? 10;
          if (!Number.isInteger(duration) || duration <= 0) throw new AppError(400, "Durasi item playlist tidak valid");
          return { contentId: it.contentId, position: idx, durationSeconds: duration };
        });
        playlists.set(id, normalized);
        return playlistsService.get(id);
      }),
      getInternal: vi.fn(async (id: string) => playlists.get(id) ?? []),
    };
    return { deviceId, c1, c2, devices, contents, playlists, devicesService, contentsService, playlistsService };
  }

  it("PUT replaces playlist transactionally, normalizes position/duration and GET returns ordered resolved items; duplicate content allowed", async () => {
    const ctx = baseSetup();
    const app = await buildApp({
      config: { HOST: "127.0.0.1", PORT: 0, ...AUTH } as any,
      db: null, events: createEventBus(),
      devicesService: ctx.devicesService as any,
      contentsService: ctx.contentsService as any,
      playlistsService: ctx.playlistsService as any,
    } as any);
    apps.push(app);
    const headers = await authHeader(app);

    const put = await app.inject({
      method: "PUT", url: `/api/devices/${ctx.deviceId}/playlist`, headers,
      payload: { items: [
        { contentId: ctx.c2.id, durationSeconds: 20, position: 5 },
        { contentId: ctx.c1.id },
        { contentId: ctx.c2.id, durationSeconds: 7 },
      ] },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual([
      { position: 0, durationSeconds: 20, content: ctx.c2 },
      { position: 1, durationSeconds: 10, content: ctx.c1 },
      { position: 2, durationSeconds: 7, content: ctx.c2 },
    ]);
    expect(ctx.playlistsService.replace).toHaveBeenCalledOnce();

    const get = await app.inject({ method: "GET", url: `/api/devices/${ctx.deviceId}/playlist`, headers });
    expect(get.statusCode).toBe(200);
    expect(get.json()[1]).toMatchObject({ position: 1, durationSeconds: 10, content: { id: ctx.c1.id } });
  });

  it("rejects invalid playlist requests with clear errors", async () => {
    const ctx = baseSetup();
    const app = await buildApp({
      config: { HOST: "127.0.0.1", PORT: 0, ...AUTH } as any,
      db: null, events: createEventBus(),
      devicesService: ctx.devicesService as any,
      contentsService: ctx.contentsService as any,
      playlistsService: ctx.playlistsService as any,
    } as any);
    apps.push(app);
    const headers = await authHeader(app);

    const badDevice = await app.inject({ method: "PUT", url: `/api/devices/99999999-9999-4999-8999-999999999999/playlist`, headers, payload: { items: [] } });
    expect(badDevice.statusCode).toBe(404);
    expect(badDevice.json().message).toMatch(/Device/i);

    const badContent = await app.inject({ method: "PUT", url: `/api/devices/${ctx.deviceId}/playlist`, headers, payload: { items: [{ contentId: "99999999-9999-4999-8999-999999999999" }] } });
    expect(badContent.statusCode).toBe(404);
    expect(badContent.json().message).toMatch(/Content/i);

    const badDuration = await app.inject({ method: "PUT", url: `/api/devices/${ctx.deviceId}/playlist`, headers, payload: { items: [{ contentId: ctx.c1.id, durationSeconds: 0 }] } });
    expect(badDuration.statusCode).toBe(400);
    expect(badDuration.json().message).toMatch(/durasi|valid/i);

    const badBody = await app.inject({ method: "PUT", url: `/api/devices/${ctx.deviceId}/playlist`, headers, payload: { items: [{ contentId: "not-a-uuid" }] } });
    expect(badBody.statusCode).toBe(400);

    const getBad = await app.inject({ method: "GET", url: `/api/devices/99999999-9999-4999-8999-999999999999/playlist`, headers });
    expect(getBad.statusCode).toBe(404);
  });

  it("sync includes ordered resolved playlist and sets mode; playlist changes/connect/push/release trigger full sync", async () => {
    const ctx = baseSetup();
    const app = await buildApp({
      config: { HOST: "127.0.0.1", PORT: 0, ...AUTH } as any,
      db: null, events: createEventBus(),
      devicesService: ctx.devicesService as any,
      contentsService: ctx.contentsService as any,
      playlistsService: ctx.playlistsService as any,
    } as any);
    apps.push(app);
    const addr = await app.listen({ host: "127.0.0.1", port: 0 });
    const base = addr.replace("http", "ws");
    const headers = await authHeader(app);

    const device = new WebSocket(`${base}/ws/device`);
    await waitForOpen(device);
    const idleP = waitForMessage(device, (m) => m.type === "sync" && m.mode === "idle");
    device.send(JSON.stringify({ type: "hello", deviceId: ctx.deviceId, token: "dev-token" }));
    expect(await idleP).toMatchObject({ mode: "idle", pushed: null, playlist: [] });

    const playlistSyncP = waitForMessage(device, (m) => m.type === "sync" && m.mode === "playlist");
    const put = await app.inject({ method: "PUT", url: `/api/devices/${ctx.deviceId}/playlist`, headers, payload: { items: [{ contentId: ctx.c1.id, durationSeconds: 15 }, { contentId: ctx.c2.id }] } });
    expect(put.statusCode).toBe(200);
    const playlistSync = await playlistSyncP;
    expect(playlistSync.playlist).toEqual([
      { position: 0, durationSeconds: 15, content: ctx.c1 },
      { position: 1, durationSeconds: 10, content: ctx.c2 },
    ]);
    expect(playlistSync.pushed).toBeNull();

    const pushSyncP = waitForMessage(device, (m) => m.type === "sync" && m.mode === "push");
    await app.inject({ method: "POST", url: `/api/devices/${ctx.deviceId}/push`, headers, payload: { contentId: ctx.c2.id } });
    const pushSync = await pushSyncP;
    expect(pushSync.pushed.id).toBe(ctx.c2.id);
    expect(pushSync.playlist.length).toBe(2);

    const releaseSyncP = waitForMessage(device, (m) => m.type === "sync" && m.mode === "playlist");
    await app.inject({ method: "DELETE", url: `/api/devices/${ctx.deviceId}/push`, headers });
    const releaseSync = await releaseSyncP;
    expect(releaseSync.mode).toBe("playlist");
    expect(releaseSync.playlist.length).toBe(2);

    device.close();

    const device2 = new WebSocket(`${base}/ws/device`);
    await waitForOpen(device2);
    const connectSyncP = waitForMessage(device2, (m) => m.type === "sync");
    device2.send(JSON.stringify({ type: "hello", deviceId: ctx.deviceId, token: "dev-token" }));
    expect(await connectSyncP).toMatchObject({ mode: "playlist" });
    device2.close();
  });
});
