import { createHash } from "node:crypto";
import { once } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { buildApp } from "./app.ts";
import { createEventBus } from "./platform/events.ts";

const id = "11111111-1111-4111-8111-111111111111";
const sockets: WebSocket[] = [];
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  vi.useRealTimers();
  sockets.splice(0).forEach((s) => s.terminate());
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

it("heartbeat dan timeout socket lama tidak memperpanjang atau memutus umur pengganti", async () => {
  const h = await setup();
  const old = await h.open();
  const oldServerSocket = [...h.app.websocketServer.clients][0]!;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let synced = h.sync(old); h.hello(old); await synced;
  await vi.advanceTimersByTimeAsync(20000);
  const replacement = await h.open();
  const replaced = once(old, "close");
  synced = h.sync(replacement); h.hello(replacement); await synced; await replaced;
  const ack = h.sync(replacement);
  replacement.send(JSON.stringify({ type: "heartbeat" }));
  expect(await ack).toEqual({ type: "heartbeat_ack" });
  const staleSend = vi.spyOn(oldServerSocket, "send");
  await vi.advanceTimersByTimeAsync(20000);
  oldServerSocket.emit("message", Buffer.from(JSON.stringify({ type: "heartbeat" })));
  expect(staleSend).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(5000);
  expect(replacement.readyState).toBe(WebSocket.OPEN);
  expect(h.device.status).toBe("online");
  const closed = once(replacement, "close");
  await vi.advanceTimersByTimeAsync(20000);
  expect((await closed)[1].toString()).toBe("Heartbeat timeout");
  expect(h.device.status).toBe("offline");
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
async function setup() {
  const device = { id, status: "offline", lastSeen: null, tokenHash: createHash("sha256").update("valid").digest("hex") };
  const devices = {
    list: async () => [device],
    findById: vi.fn(async () => device),
    setPresence: vi.fn(async (_id: string, status: string) => { device.status = status; return device; }),
  };
  const playlists = { get: vi.fn(async () => []) };
  const app = await buildApp({ config: { HOST: "127.0.0.1", PORT: 0 } as any, db: null,
    events: createEventBus(), devicesService: devices as any, playlistsService: playlists as any });
  apps.push(app);
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  async function open() {
    const socket = new WebSocket(`${address.replace("http", "ws")}/ws/device`);
    sockets.push(socket);
    await once(socket, "open");
    return socket;
  }
  const hello = (socket: WebSocket, token = "valid") => socket.send(JSON.stringify({ type: "hello", deviceId: id, token }));
  const sync = (socket: WebSocket) => once(socket, "message").then(([data]) => JSON.parse(String(data)));
  return { app, devices, device, playlists, open, hello, sync };
}

it("koneksi sah terbaru menggantikan socket lama dengan 4009 tanpa close lama menghapus Presence pengganti", async () => {
  const h = await setup();
  const old = await h.open();
  let synced = h.sync(old); h.hello(old); await synced;
  const oldServerSocket = [...h.app.websocketServer.clients][0]!;
  const invalid = await h.open();
  const denied = once(invalid, "close"); h.hello(invalid, "invalid");
  expect((await denied)[0]).toBe(1008);
  expect(old.readyState).toBe(WebSocket.OPEN);
  const replacement = await h.open();
  const closed = once(old, "close");
  synced = h.sync(replacement); h.hello(replacement); await synced;
  expect((await closed)[0]).toBe(4009);
  oldServerSocket.emit("message", Buffer.from(JSON.stringify({ type: "heartbeat" })));
  oldServerSocket.emit("message", Buffer.from(JSON.stringify({ type: "hello", deviceId: id, token: "valid" })));
  oldServerSocket.emit("error", new Error("Galat socket lama"));
  oldServerSocket.emit("close", 1006, Buffer.alloc(0));
  // A further authenticated hello on the same socket must never register it again.
  h.hello(replacement);
  const newest = await h.open();
  const replaced = once(replacement, "close");
  synced = h.sync(newest); h.hello(newest); await synced; await replaced;
  expect(h.device.status).toBe("online");
  expect(h.devices.setPresence.mock.calls.filter(([, status]) => status === "offline")).toHaveLength(0);
  newest.send(JSON.stringify({ type: "heartbeat" }));
  newest.close(); await once(newest, "close");
  await vi.waitFor(() => expect(h.device.status).toBe("offline"));
});

it("penyelesaian Presence async lama diurutkan sebelum Online pengganti dan tidak mengirim sync lama", async () => {
  const h = await setup();
  const pending = deferred();
  h.devices.setPresence.mockImplementationOnce(async (_id, status) => {
    await pending.promise;
    h.device.status = status;
    return h.device;
  });
  const old = await h.open(); h.hello(old);
  await vi.waitFor(() => expect(h.devices.setPresence).toHaveBeenCalledTimes(1));
  const replacement = await h.open();
  const closed = once(old, "close");
  const synced = h.sync(replacement); h.hello(replacement); await closed;
  pending.resolve(); await synced;
  expect(h.device.status).toBe("online");
  expect(h.playlists.get).toHaveBeenCalledTimes(1);
  expect(h.devices.setPresence.mock.calls.map(([, status]) => status)).toEqual(["online", "online"]);
});

it("autentikasi lama yang selesai belakangan tidak mengambil alih koneksi lebih baru", async () => {
  const h = await setup();
  const pending = deferred();
  h.devices.findById.mockImplementationOnce(async () => { await pending.promise; return h.device; });
  const old = await h.open(); h.hello(old);
  await vi.waitFor(() => expect(h.devices.findById).toHaveBeenCalledTimes(1));
  const replacement = await h.open();
  const synced = h.sync(replacement); h.hello(replacement); await synced;
  const closed = once(old, "close"); pending.resolve();
  expect((await closed)[0]).toBe(4009);
  expect(h.devices.setPresence).toHaveBeenCalledTimes(1);
  expect(h.device.status).toBe("online");
});

it("hello duplikat dan sync async lama tidak mendaftarkan ulang atau mengirim tayangan usang ke pengganti", async () => {
  const h = await setup();
  const pending = deferred();
  h.playlists.get.mockImplementationOnce(async () => { await pending.promise; return []; });
  const old = await h.open();
  h.hello(old); h.hello(old);
  await vi.waitFor(() => expect(h.playlists.get).toHaveBeenCalledTimes(1));
  const replacement = await h.open();
  const received: unknown[] = [];
  replacement.on("message", (data) => received.push(JSON.parse(String(data))));
  const synced = h.sync(replacement); h.hello(replacement); await synced;
  pending.resolve();
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(received).toHaveLength(1);
  expect(h.devices.setPresence).toHaveBeenCalledTimes(2);
  expect(h.device.status).toBe("online");
});
