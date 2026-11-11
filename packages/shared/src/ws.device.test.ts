import { describe, expect, it } from "vitest";
import { deviceClientMessageSchema, deviceServerMessageSchema, helloMessageSchema, syncMessageSchema } from "./index.ts";

describe("shared device ws schemas", () => {
  it("membedakan heartbeat_ack dari sync dan menolak pesan server malformed", () => {
    expect(deviceServerMessageSchema.parse({ type: "heartbeat_ack" })).toEqual({ type: "heartbeat_ack" });
    expect(deviceServerMessageSchema.parse({ type: "sync", mode: "idle", pushed: null, playlist: [] }).type).toBe("sync");
    for (const message of [{}, { type: "heartbeat" }, { type: "heartbeat_ack", mode: "idle" }, { type: "sync" }]) {
      expect(deviceServerMessageSchema.safeParse(message).success).toBe(false);
    }
  });
  it("requires token in device hello", () => {
    const msg = helloMessageSchema.parse({
      type: "hello",
      deviceId: "11111111-1111-4111-8111-111111111111",
      token: "secret-token",
    });
    expect(msg).toEqual({
      type: "hello",
      deviceId: "11111111-1111-4111-8111-111111111111",
      token: "secret-token",
    });
    expect(() =>
      helloMessageSchema.parse({ type: "hello", deviceId: "11111111-1111-4111-8111-111111111111" }),
    ).toThrow();
  });

  it("parses device client hello with token", () => {
    const msg = deviceClientMessageSchema.parse({
      type: "hello",
      deviceId: "11111111-1111-4111-8111-111111111111",
      token: "secret-token",
    });
    expect(msg.type).toBe("hello");
  });

  it("parses full-state sync (push/idle) with playlist array", () => {
    const idle = syncMessageSchema.parse({
      type: "sync",
      mode: "idle",
      pushed: null,
      playlist: [],
    });
    expect(idle.mode).toBe("idle");
    expect(idle.pushed).toBeNull();

    const push = syncMessageSchema.parse({
      type: "sync",
      mode: "push",
      pushed: {
        id: "22222222-2222-4222-8222-222222222222",
        judul: "Halo",
        tipe: "text",
        payload: "hai",
        createdAt: "2026-11-11T10:00:00.000Z",
      },
      playlist: [],
    });
    expect(push.mode).toBe("push");
    expect(push.pushed?.id).toBe("22222222-2222-4222-8222-222222222222");
  });
});
