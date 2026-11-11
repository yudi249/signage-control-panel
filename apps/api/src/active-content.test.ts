import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { buildApp } from "./app.ts";
import { createEventBus } from "./platform/events.ts";

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

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
}

describe("active content per device", () => {
  const apps: any[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  it("sets active content, persists it, and syncs connected device immediately", async () => {
    const deviceId = "11111111-1111-4111-8111-111111111111";
    const contentId = "22222222-2222-4222-8222-222222222222";
    const devices = new Map<string, any>([
      [deviceId, { id: deviceId, nama: "A", lokasi: "", status: "offline", lastSeen: null, pushedContentId: null }],
    ]);
    const contents = new Map<string, any>([
      [contentId, { id: contentId, judul: "Halo", tipe: "text", payload: "hai", createdAt: "2026-11-11T10:00:00.000Z" }],
    ]);
    const devicesService = {
      list: vi.fn(async () => Array.from(devices.values())),
      get: vi.fn(async (id: string) => {
        const d = devices.get(id);
        if (!d) throw Object.assign(new Error("Device tidak ditemukan"), { statusCode: 404, name: "AppError" });
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

    const app = await buildApp({
      config: { HOST: "127.0.0.1", PORT: 0 } as any,
      db: null,
      events: createEventBus(),
      devicesService: devicesService as any,
      contentsService: contentsService as any,
    } as any);
    apps.push(app);
    const addr = await app.listen({ host: "127.0.0.1", port: 0 });
    const base = addr.replace("http", "ws");

    const device = new WebSocket(`${base}/ws/device`);
    await waitForOpen(device);
    const initialSyncP = waitForMessage(device, (m) => m.type === "sync");
    device.send(JSON.stringify({ type: "hello", deviceId }));
    const initial = await initialSyncP;
    expect(initial.content).toBeNull();

    const syncP = waitForMessage(device, (m) => m.type === "sync" && m.content?.id === contentId);
    const res = await app.inject({ method: "PUT", url: `/api/devices/${deviceId}/active-content`, payload: { contentId } });
    expect(res.statusCode).toBe(200);
    expect(res.json().pushedContentId).toBe(contentId);

    const sync = await syncP;
    expect(sync.content.judul).toBe("Halo");

    const getRes = await app.inject({ method: "GET", url: `/api/devices/${deviceId}` });
    expect(getRes.json().pushedContentId).toBe(contentId);

    device.close();
  });

  it("clears active content and syncs null", async () => {
    const deviceId = "11111111-1111-4111-8111-111111111111";
    const devices = new Map<string, any>([
      [deviceId, { id: deviceId, nama: "A", lokasi: "", status: "offline", lastSeen: null, pushedContentId: "22222222-2222-4222-8222-222222222222" }],
    ]);
    const devicesService = {
      list: vi.fn(async () => Array.from(devices.values())),
      get: vi.fn(async (id: string) => {
        const d = devices.get(id);
        if (!d) throw Object.assign(new Error("Device tidak ditemukan"), { statusCode: 404, name: "AppError" });
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

    const app = await buildApp({
      config: { HOST: "127.0.0.1", PORT: 0 } as any,
      db: null,
      events: createEventBus(),
      devicesService: devicesService as any,
      contentsService: { findById: vi.fn(async () => null) } as any,
    } as any);
    apps.push(app);
    const addr = await app.listen({ host: "127.0.0.1", port: 0 });
    const base = addr.replace("http", "ws");

    const device = new WebSocket(`${base}/ws/device`);
    await waitForOpen(device);
    device.send(JSON.stringify({ type: "hello", deviceId }));
    await waitForMessage(device, (m) => m.type === "sync");

    const syncP = waitForMessage(device, (m) => m.type === "sync" && m.content === null);
    const res = await app.inject({ method: "DELETE", url: `/api/devices/${deviceId}/active-content` });
    expect(res.statusCode).toBe(200);
    expect(res.json().pushedContentId).toBeNull();
    const sync = await syncP;
    expect(sync.content).toBeNull();
    device.close();
  });

  it("returns clear errors for invalid device or content", async () => {
    const deviceId = "11111111-1111-4111-8111-111111111111";
    const devices = new Map<string, any>([
      [deviceId, { id: deviceId, nama: "A", lokasi: "", status: "offline", lastSeen: null, pushedContentId: null }],
    ]);
    const devicesService = {
      list: vi.fn(async () => Array.from(devices.values())),
      get: vi.fn(async (id: string) => {
        const d = devices.get(id);
        if (!d) throw Object.assign(new Error("Device tidak ditemukan"), { statusCode: 404, name: "AppError" });
        return { ...d };
      }),
      findById: vi.fn(async (id: string) => devices.get(id) ?? null),
      setActiveContent: vi.fn(async (id: string, pushedContentId: string | null) => {
        const d = devices.get(id); if (!d) return null; d.pushedContentId = pushedContentId; return { ...d };
      }),
      setPresence: vi.fn(async () => null),
    };
    const contentsService = { findById: vi.fn(async () => null) };

    const app = await buildApp({
      config: { HOST: "127.0.0.1", PORT: 0 } as any,
      db: null,
      events: createEventBus(),
      devicesService: devicesService as any,
      contentsService: contentsService as any,
    } as any);
    apps.push(app);

    const badDevice = await app.inject({ method: "PUT", url: "/api/devices/99999999-9999-4999-8999-999999999999/active-content", payload: { contentId: "22222222-2222-4222-8222-222222222222" } });
    expect(badDevice.statusCode).toBe(404);
    expect(badDevice.json().message).toMatch(/Device/i);

    const badContent = await app.inject({ method: "PUT", url: `/api/devices/${deviceId}/active-content`, payload: { contentId: "22222222-2222-4222-8222-222222222222" } });
    expect(badContent.statusCode).toBe(404);
    expect(badContent.json().message).toMatch(/Content/i);

    const badBody = await app.inject({ method: "PUT", url: `/api/devices/${deviceId}/active-content`, payload: {} });
    expect(badBody.statusCode).toBe(400);
  });
});
