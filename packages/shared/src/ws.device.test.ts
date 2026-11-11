import { describe, expect, it } from "vitest";
import { deviceClientMessageSchema, helloMessageSchema } from "./index.ts";

describe("shared device ws schemas", () => {
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
});
