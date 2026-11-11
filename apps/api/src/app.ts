import Fastify, { type FastifyInstance } from "fastify";
import { authModule } from "./modules/auth/index.ts";
import { contentsModule } from "./modules/contents/index.ts";
import { devicesModule } from "./modules/devices/index.ts";
import { playlistsModule } from "./modules/playlists/index.ts";
import { presenceModule } from "./modules/presence/index.ts";
import type { Config } from "./platform/config.ts";
import type { EventBus } from "./platform/events.ts";
import type { Db } from "./platform/supabase.ts";

export interface BuildAppOptions {
  config: Config;
  db: Db | null;
  events: EventBus;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(authModule, { prefix: "/api" });
  await app.register(devicesModule, { prefix: "/api", db: opts.db });
  await app.register(contentsModule, { prefix: "/api", db: opts.db });
  await app.register(playlistsModule, { prefix: "/api" });
  await app.register(presenceModule, { prefix: "/api" });

  void opts.config;
  void opts.events;
  return app;
}
