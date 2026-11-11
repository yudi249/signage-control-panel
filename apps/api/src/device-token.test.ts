import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { buildApp } from "./app.ts";
import { createEventBus } from "./platform/events.ts";

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

function waitForClose(ws: WebSocket, timeoutMs = 2000): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting for close")), timeoutMs);
    ws.once("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
    ws.once("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

async function authHeader(app: any): Promise<{ authorization: string }> {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "admin", password: "adminpass" } });
  return { authorization: `Bearer ${res.json().token}` };
}

describe("device token and /ws/device auth", () => {
  const apps: any[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  it("create returns device and token once; GET/PATCH/list never expose token", async () => {
    const deviceId = "11111111-1111-4111-8111-111111111111";
    const store = new Map<string, any>();
    const devicesService = {
      list: vi.fn(async () => Array.from(store.values()).map(({ tokenHash: _t, token: _p, ...d }) => d)),
      get: vi.fn(async (id: string) => {
        const d = store.get(id);
        if (!d) throw Object.assign(new Error("Device tidak ditemukan"), { statusCode: 404, name: "AppError" });
        const { tokenHash: _t, token: _p, ...rest } = d; return rest;
      }),
      findById: vi.fn(async (id: string) => {
        const d = store.get(id); if (!d) return null; const { token, ...rest } = d; return rest;
      }),
      createWithToken: vi.fn(async (input: any) => {
        const token = "plain-token-once";
        const device = { id: deviceId, nama: input.nama, lokasi: input.lokasi ?? "", status: "offline", lastSeen: null, pushedContentId: null };
        store.set(deviceId, { ...device, tokenHash: hashToken(token) });
        return { device, token };
      }),
      update: vi.fn(async (id: string, input: any) => {
        const d = store.get(id); if (!d) throw Object.assign(new Error("Device tidak ditemukan"), { statusCode: 404, name: "AppError" });
        Object.assign(d, input); const { tokenHash: _t, token: _p, ...rest } = d; return rest;
      }),
      setPresence: vi.fn(async () => null),
      setActiveContent: vi.fn(async () => null),
    } as any;

    const app = await buildApp({ config: { HOST: "127.0.0.1", PORT: 0, ...AUTH } as any, db: null, events: createEventBus(), devicesService } as any);
    apps.push(app);
    const headers = await authHeader(app);

    const created = await app.inject({ method: "POST", url: "/api/devices", payload: { nama: "Lobby", lokasi: "L1" }, headers });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({
      device: { id: deviceId, nama: "Lobby", lokasi: "L1", status: "offline", lastSeen: null, pushedContentId: null },
      token: "plain-token-once",
    });

    const list = await app.inject({ method: "GET", url: "/api/devices", headers });
    expect(list.statusCode).toBe(200);
    expect(JSON.stringify(list.json())).not.toContain("plain-token-once");
    expect(JSON.stringify(list.json())).not.toContain("tokenHash");

    const get = await app.inject({ method: "GET", url: `/api/devices/${deviceId}`, headers });
    expect(get.statusCode).toBe(200);
    expect(get.json().token).toBeUndefined();
    expect(JSON.stringify(get.json())).not.toContain("plain-token-once");

    const patch = await app.inject({ method: "PATCH", url: `/api/devices/${deviceId}`, payload: { nama: "Lobby 2" }, headers });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().token).toBeUndefined();
  });

  it("rotates token, returns new token once, invalidates old, disconnects active ws", async () => {
    const deviceId = "11111111-1111-4111-8111-111111111111";
    const state = { tokenHash: hashToken("old-token"), rotated: "new-token" };
    const device = { id: deviceId, nama: "A", lokasi: "", status: "offline", lastSeen: null, pushedContentId: null };
    const devicesService = {
      list: vi.fn(async () => [device]),
      findById: vi.fn(async (id: string) => id === deviceId ? { ...device, tokenHash: state.tokenHash } : null),
      get: vi.fn(async (id: string) => device),
      rotateToken: vi.fn(async (id: string) => {
        if (id !== deviceId) throw Object.assign(new Error("Device tidak ditemukan"), { statusCode: 404, name: "AppError" });
        state.tokenHash = hashToken(state.rotated);
        return { device, token: state.rotated };
      }),
      setPresence: vi.fn(async (_id: string, status: string) => ({ ...device, status, lastSeen: "2026-11-11T10:00:00.000Z" })),
    } as any;

    const app = await buildApp({ config: { HOST: "127.0.0.1", PORT: 0, ...AUTH } as any, db: null, events: createEventBus(), devicesService, contentsService: { findById: vi.fn(async () => null) } as any } as any);
    apps.push(app);
    const addr = await app.listen({ host: "127.0.0.1", port: 0 });
    const base = addr.replace("http", "ws");
    const headers = await authHeader(app);

    const ws = new WebSocket(`${base}/ws/device`);
    await waitForOpen(ws);
    const syncP = waitForMessage(ws, (m) => m.type === "sync");
    ws.send(JSON.stringify({ type: "hello", deviceId, token: "old-token" }));
    await syncP;
    const closedP = waitForClose(ws);

    const rot = await app.inject({ method: "POST", url: `/api/devices/${deviceId}/token`, headers });
    expect(rot.statusCode).toBe(200);
    expect(rot.json()).toEqual({ device, token: "new-token" });

    const closed = await closedP;
    expect([1000, 1008, 4001]).toContain(closed.code);

    const wsOld = new WebSocket(`${base}/ws/device`);
    await waitForOpen(wsOld);
    const closeOld = waitForClose(wsOld);
    wsOld.send(JSON.stringify({ type: "hello", deviceId, token: "old-token" }));
    const rOld = await closeOld;
    expect(rOld.code).toBe(1008);
    expect(rOld.reason).toMatch(/token|tidak valid|salah|tidak cocok/i);
  });

  it("/ws/device rejects unknown device or bad token with clear reason and accepts valid token (sync/presence/heartbeat)", async () => {
    const deviceId = "11111111-1111-4111-8111-111111111111";
    const token = "good-token";
    const device = { id: deviceId, nama: "A", lokasi: "", status: "offline", lastSeen: null, pushedContentId: "22222222-2222-4222-8222-222222222222" };
    const content = { id: "22222222-2222-4222-8222-222222222222", judul: "C", tipe: "text", payload: "hi", createdAt: "2026-11-11T10:00:00.000Z" };
    const devicesService = {
      list: vi.fn(async () => [device]),
      findById: vi.fn(async (id: string) => id === deviceId ? { ...device, tokenHash: hashToken(token) } : null),
      setPresence: vi.fn(async (_id: string, status: string) => ({ ...device, status, lastSeen: "2026-11-11T10:00:00.000Z" })),
    } as any;
    const contentsService = { findById: vi.fn(async (id: string) => id === content.id ? content : null) };

    const app = await buildApp({ config: { HOST: "127.0.0.1", PORT: 0, ...AUTH } as any, db: null, events: createEventBus(), devicesService, contentsService: contentsService as any } as any);
    apps.push(app);
    const addr = await app.listen({ host: "127.0.0.1", port: 0 });
    const base = addr.replace("http", "ws");
    const adminToken = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "admin", password: "adminpass" } })).json().token;

    const wsBad = new WebSocket(`${base}/ws/device`);
    await waitForOpen(wsBad);
    const closeBad = waitForClose(wsBad);
    wsBad.send(JSON.stringify({ type: "hello", deviceId: "99999999-9999-4999-8999-999999999999", token }));
    const rBad = await closeBad;
    expect(rBad.code).toBe(1008);
    expect(rBad.reason).toMatch(/device|terdaftar|tidak dikenal/i);

    const wsWrong = new WebSocket(`${base}/ws/device`);
    await waitForOpen(wsWrong);
    const closeWrong = waitForClose(wsWrong);
    wsWrong.send(JSON.stringify({ type: "hello", deviceId, token: "nope" }));
    const rWrong = await closeWrong;
    expect(rWrong.code).toBe(1008);
    expect(rWrong.reason).toMatch(/token|tidak valid|salah|tidak cocok/i);

    const admin = new WebSocket(`${base}/ws/admin`);
    await waitForOpen(admin);
    const snapshotP = waitForMessage(admin, (m) => m.type === "snapshot");
    admin.send(JSON.stringify({ type: "auth", token: adminToken }));
    await snapshotP;
    const onlineP = waitForMessage(admin, (m) => m.type === "presence" && m.status === "online");

    const wsOk = new WebSocket(`${base}/ws/device`);
    await waitForOpen(wsOk);
    const syncP = waitForMessage(wsOk, (m) => m.type === "sync");
    wsOk.send(JSON.stringify({ type: "hello", deviceId, token }));
    const sync = await syncP;
    expect(sync).toMatchObject({ type: "sync", mode: "push" }); expect(sync.pushed?.id).toBe(content.id); expect(sync.playlist).toEqual([]);
    const online = await onlineP;
    expect(online.deviceId).toBe(deviceId);

    wsOk.send(JSON.stringify({ type: "heartbeat" }));

    const offlineP = waitForMessage(admin, (m) => m.type === "presence" && m.status === "offline");
    wsOk.close();
    const offline = await offlineP;
    expect(offline.status).toBe("offline");
    admin.close();
  });
});



