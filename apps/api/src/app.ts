import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { authModule } from "./modules/auth/index.ts";
import { contentsModule } from "./modules/contents/index.ts";
import { devicesModule, DevicesRepository, DevicesService } from "./modules/devices/index.ts";
import { playlistsModule } from "./modules/playlists/index.ts";
import { presenceModule } from "./modules/presence/index.ts";
import type { Config } from "./platform/config.ts";
import type { EventBus } from "./platform/events.ts";
import type { Db } from "./platform/supabase.ts";

export interface BuildAppOptions {
  config: Config;
  db: Db | null;
  events: EventBus;
  devicesService?: DevicesService | null;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(websocket);

  app.get("/health", async () => ({ status: "ok" }));

  const devicesService =
    opts.devicesService !== undefined
      ? opts.devicesService
      : opts.db
        ? new DevicesService(new DevicesRepository(opts.db))
        : null;

  await app.register(authModule, { prefix: "/api" });
  await app.register(devicesModule, { prefix: "/api", db: opts.db, service: devicesService ?? undefined });
  await app.register(contentsModule, { prefix: "/api", db: opts.db });
  await app.register(playlistsModule, { prefix: "/api" });

  await app.register(presenceModule, {
    db: opts.db,
    events: opts.events,
    devicesService,
  });

  void opts.config;
  return app;
}
