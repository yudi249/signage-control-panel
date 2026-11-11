import { describe, expect, it } from "vitest";
import {
  presenceMessageSchema,
  snapshotMessageSchema,
} from "./index.ts";

describe("shared ws admin schemas", () => {
  it("parses snapshot of all devices presence", () => {
    const msg = snapshotMessageSchema.parse({
      type: "snapshot",
      devices: [
        { deviceId: "11111111-1111-4111-8111-111111111111", status: "online", lastSeen: "2026-11-11T10:00:00.000Z" },
        { deviceId: "22222222-2222-4222-8222-222222222222", status: "offline", lastSeen: null },
      ],
    });
    expect(msg.type).toBe("snapshot");
    expect(msg.devices).toHaveLength(2);
  });

  it("parses presence update with lastSeen", () => {
    const msg = presenceMessageSchema.parse({
      type: "presence",
      deviceId: "11111111-1111-4111-8111-111111111111",
      status: "offline",
      lastSeen: "2026-11-11T10:05:00.000Z",
    });
    expect(msg.status).toBe("offline");
    expect(msg.lastSeen).toContain("2026-11-11");
  });
});
