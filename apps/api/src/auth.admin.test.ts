import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { buildApp } from "./app.ts";
import { createEventBus } from "./platform/events.ts";

const AUTH = {
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD_HASH: "$2b$10$Ez3iVupN5E7xvshVCt7XJuaFDAVieChUV6bafDL6prs.gVOE4i9uq", // "adminpass"
  JWT_SECRET: "test-secret-1234567890",
} as const;

async function build() {
  return buildApp({
    config: { HOST: "127.0.0.1", PORT: 0, ...AUTH } as any,
    db: null,
    events: createEventBus(),
    devicesService: { list: async () => [] } as any,
  } as any);
}

async function loginToken(app: any, username = "admin", password = "adminpass") {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password },
  });
  return res;
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

describe("admin auth", () => {
  const apps: any[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  it("POST /api/auth/login returns token for valid credentials and 401 for invalid", async () => {
    const app = await build();
    apps.push(app);

    const ok = await loginToken(app);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().token).toEqual(expect.any(String));

    const bad = await loginToken(app, "admin", "wrong");
    expect(bad.statusCode).toBe(401);
    expect(bad.json().message).toMatch(/(salah|tidak valid|gagal)/i);
  });

  it("protects /api/* except /api/auth/login and keeps /health public", async () => {
    const app = await build();
    apps.push(app);

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);

    const noAuth = await app.inject({ method: "GET", url: "/api/devices" });
    expect(noAuth.statusCode).toBe(401);
    expect(noAuth.json().message).toBeTruthy();

    const token = (await loginToken(app)).json().token as string;
    const authed = await app.inject({
      method: "GET",
      url: "/api/devices",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(authed.statusCode).toBe(200);

    const bad = await app.inject({
      method: "GET",
      url: "/api/devices",
      headers: { authorization: "Bearer not-a-jwt" },
    });
    expect(bad.statusCode).toBe(401);
  });

  it("/ws/admin requires first auth message before snapshot and closes clearly on invalid token", async () => {
    const app = await build();
    apps.push(app);
    const addr = await app.listen({ host: "127.0.0.1", port: 0 });
    const wsUrl = addr.replace("http", "ws") + "/ws/admin";

    const admin = new WebSocket(wsUrl);
    await waitForOpen(admin);
    const closed = waitForClose(admin);
    admin.send(JSON.stringify({ type: "auth", token: "bad-token" }));
    const result = await closed;
    expect(result.code).toBe(1008);
    expect(result.reason).toMatch(/(tidak valid|kedaluwarsa|token|auth)/i);
  });

  it("/ws/admin sends snapshot and presence after valid auth", async () => {
    const app = await build();
    apps.push(app);
    const addr = await app.listen({ host: "127.0.0.1", port: 0 });
    const wsUrl = addr.replace("http", "ws") + "/ws/admin";
    const token = (await loginToken(app)).json().token as string;

    const admin = new WebSocket(wsUrl);
    await waitForOpen(admin);
    const snapshotP = waitForMessage(admin, (m) => m.type === "snapshot");
    admin.send(JSON.stringify({ type: "auth", token }));
    const snapshot = await snapshotP;
    expect(snapshot.devices).toEqual([]);
    admin.close();
  });
});
