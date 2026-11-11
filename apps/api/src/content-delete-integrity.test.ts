import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function waitForMessage(
  ws: WebSocket,
  predicate: (msg: any) => boolean,
  timeoutMs = 2000,
): Promise<any> {
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
    ws.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

async function authHeader(app: any): Promise<{ authorization: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "admin", password: "adminpass" },
  });
  return { authorization: `Bearer ${res.json().token}` };
}

describe("content delete integrity (playlist and push)", () => {
  const apps: any[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  function setup() {
    const contentId = "22222222-2222-4222-8222-222222222222";
    const content = {
      id: contentId,
      judul: "Video",
      tipe: "video" as const,
      payload: "https://cdn.test/v.mp4",
      createdAt: "2026-11-11T10:00:00.000Z",
    };
    const deviceA = "11111111-1111-4111-8111-111111111111";
    const deviceB = "33333333-3333-4333-8333-333333333333";
    const devices = new Map<string, any>([
      [deviceA, { id: deviceA, nama: "A", lokasi: "", status: "offline", lastSeen: null, pushedContentId: null, tokenHash: hashToken("tok-a") }],
      [deviceB, { id: deviceB, nama: "B", lokasi: "", status: "offline", lastSeen: null, pushedContentId: null, tokenHash: hashToken("tok-b") }],
    ]);
    const contents = new Map<string, any>([[contentId, { ...content }]]);
    const playlists = new Map<string, Array<{ contentId: string; position: number; durationSeconds: number }>>([
      [deviceA, []],
      [deviceB, []],
    ]);

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
      listPushedByContent: vi.fn(async (cid: string) => Array.from(devices.values()).filter((d) => d.pushedContentId === cid).map((d) => ({ ...d }))),
    };
    const contentsService = {
      list: vi.fn(async () => Array.from(contents.values())),
      get: vi.fn(async (id: string) => {
        const c = contents.get(id);
        if (!c) throw new AppError(404, "Content tidak ditemukan");
        return c;
      }),
      findById: vi.fn(async (id: string) => contents.get(id) ?? null),
      create: vi.fn(async (input: any) => {
        const c = { id: crypto.randomUUID(), ...input, createdAt: "2026-11-11T10:00:00.000Z" };
        contents.set(c.id, c); return c;
      }),
      update: vi.fn(async () => null),
      delete: vi.fn(async (id: string) => {
        const c = contents.get(id);
        if (!c) throw new AppError(404, "Content tidak ditemukan");
        contents.delete(id);
      }),
    };
    const playlistsService = {
      get: vi.fn(async (id: string) => {
        if (!devices.has(id)) throw new AppError(404, "Device tidak ditemukan");
        const items = playlists.get(id) ?? [];
        return items.slice().sort((a, b) => a.position - b.position).map((it) => ({
          position: it.position,
          durationSeconds: it.durationSeconds,
          content: contents.get(it.contentId),
        }));
      }),
      replace: vi.fn(async (id: string, body: any) => {
        if (!devices.has(id)) throw new AppError(404, "Device tidak ditemukan");
        const items = (body.items ?? []).map((it: any, idx: number) => ({
          contentId: it.contentId, position: idx, durationSeconds: it.durationSeconds ?? 10,
        }));
        playlists.set(id, items);
        return playlistsService.get(id);
      }),
      getInternal: vi.fn(async (id: string) => playlists.get(id) ?? []),
      isContentReferenced: vi.fn(async (cid: string) =>
        Array.from(playlists.values()).some((items) => items.some((it) => it.contentId === cid))),
    };

    return { contentId, content, deviceA, deviceB, devices, contents, playlists, devicesService, contentsService, playlistsService };
  }

  it("rejects delete when content is referenced in any device playlist", async () => {
    const ctx = setup();
    ctx.playlists.set(ctx.deviceA, [{ contentId: ctx.contentId, position: 0, durationSeconds: 10 }]);
    const app = await buildApp({
      config: { HOST: "127.0.0.1", PORT: 0, ...AUTH } as any,
      db: null, events: createEventBus(),
      devicesService: ctx.devicesService as any,
      contentsService: ctx.contentsService as any,
      playlistsService: ctx.playlistsService as any,
    } as any);
    apps.push(app);
    const headers = await authHeader(app);

    const res = await app.inject({ method: "DELETE", url: `/api/contents/${ctx.contentId}`, headers });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(res.json().message).toMatch(/playlist/i);
    expect(ctx.contents.has(ctx.contentId)).toBe(true);
  });

  it("push-only on multiple devices: auto-releases all, deletes content, and sends full sync to affected online devices", async () => {
    const ctx = setup();
    ctx.devices.get(ctx.deviceA)!.pushedContentId = ctx.contentId;
    ctx.devices.get(ctx.deviceB)!.pushedContentId = ctx.contentId;
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

    const wsA = new WebSocket(`${base}/ws/device`);
    const wsB = new WebSocket(`${base}/ws/device`);
    await Promise.all([waitForOpen(wsA), waitForOpen(wsB)]);
    const syncA1 = waitForMessage(wsA, (m) => m.type === "sync");
    const syncB1 = waitForMessage(wsB, (m) => m.type === "sync");
    wsA.send(JSON.stringify({ type: "hello", deviceId: ctx.deviceA, token: "tok-a" }));
    wsB.send(JSON.stringify({ type: "hello", deviceId: ctx.deviceB, token: "tok-b" }));
    expect((await syncA1).mode).toBe("push");
    expect((await syncB1).mode).toBe("push");

    const relA = waitForMessage(wsA, (m) => m.type === "sync" && m.mode === "idle" && m.pushed === null);
    const relB = waitForMessage(wsB, (m) => m.type === "sync" && m.mode === "idle" && m.pushed === null);
    const res = await app.inject({ method: "DELETE", url: `/api/contents/${ctx.contentId}`, headers });
    expect(res.statusCode).toBe(204);
    expect(await relA).toMatchObject({ mode: "idle", pushed: null, playlist: [] });
    expect(await relB).toMatchObject({ mode: "idle", pushed: null, playlist: [] });
    expect(ctx.contents.has(ctx.contentId)).toBe(false);
    expect(ctx.devices.get(ctx.deviceA)!.pushedContentId).toBeNull();
    expect(ctx.devices.get(ctx.deviceB)!.pushedContentId).toBeNull();

    wsA.close(); wsB.close();
  });

  it("if referenced in playlist and also pushed, playlist rejection applies and content not deleted", async () => {
    const ctx = setup();
    ctx.playlists.set(ctx.deviceA, [{ contentId: ctx.contentId, position: 0, durationSeconds: 10 }]);
    ctx.devices.get(ctx.deviceB)!.pushedContentId = ctx.contentId;
    const app = await buildApp({
      config: { HOST: "127.0.0.1", PORT: 0, ...AUTH } as any,
      db: null, events: createEventBus(),
      devicesService: ctx.devicesService as any,
      contentsService: ctx.contentsService as any,
      playlistsService: ctx.playlistsService as any,
    } as any);
    apps.push(app);
    const headers = await authHeader(app);

    const res = await app.inject({ method: "DELETE", url: `/api/contents/${ctx.contentId}`, headers });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(res.json().message).toMatch(/playlist/i);
    expect(ctx.contents.has(ctx.contentId)).toBe(true);
    expect(ctx.devices.get(ctx.deviceB)!.pushedContentId).toBe(ctx.contentId);
  });
});
