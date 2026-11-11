import Fastify from "fastify";
import websocket from "@fastify/websocket";
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

describe("/ws/admin presence", () => {
  const apps: any[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  it("sends snapshot on connect and broadcasts presence on device connect/disconnect", async () => {
    const devices = new Map<string, any>([
      ["11111111-1111-4111-8111-111111111111", { id: "11111111-1111-4111-8111-111111111111", nama: "A", lokasi: "", status: "offline", lastSeen: null, pushedContentId: null }],
    ]);
    const devicesService = {
      list: vi.fn(async () => Array.from(devices.values())),
      findById: vi.fn(async (id: string) => devices.get(id) ?? null),
      setPresence: vi.fn(async (id: string, status: "online" | "offline") => {
        const d = devices.get(id); if (!d) return null;
        d.status = status; d.lastSeen = "2026-11-11T10:00:00.000Z"; return d;
      }),
    };

    const app = await buildApp({
      config: { HOST: "127.0.0.1", PORT: 0 } as any,
      db: null,
      events: createEventBus(),
      devicesService: devicesService as any,
    } as any);
    apps.push(app);
    const addr = await app.listen({ host: "127.0.0.1", port: 0 });
    const base = addr.replace("http", "ws");

    const admin = new WebSocket(`${base}/ws/admin`);
    const snapshotP = waitForMessage(admin, (m) => m.type === "snapshot");
    await waitForOpen(admin);
    const snapshot = await snapshotP;
    expect(snapshot.devices).toEqual([
      { deviceId: "11111111-1111-4111-8111-111111111111", status: "offline", lastSeen: null },
    ]);

    const presenceP = waitForMessage(admin, (m) => m.type === "presence" && m.status === "online");
    const device = new WebSocket(`${base}/ws/device`);
    await waitForOpen(device);
    device.send(JSON.stringify({ type: "hello", deviceId: "11111111-1111-4111-8111-111111111111" }));
    const online = await presenceP;
    expect(online.deviceId).toBe("11111111-1111-4111-8111-111111111111");
    expect(online.lastSeen).toBeTruthy();

    const offlineP = waitForMessage(admin, (m) => m.type === "presence" && m.status === "offline");
    device.close();
    const offline = await offlineP;
    expect(offline.status).toBe("offline");

    admin.close();
  });
});
