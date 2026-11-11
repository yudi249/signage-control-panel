import type { FastifyPluginAsync } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { devicesRoutes } from "./devices.routes.ts";
import { DevicesRepository } from "./devices.repository.ts";
import { DevicesService } from "./devices.service.ts";

export interface DevicesModuleOptions {
  db: SupabaseClient | null;
  service?: DevicesService;
}

export const devicesModule: FastifyPluginAsync<DevicesModuleOptions> = async (app, opts) => {
  if (!opts.db || !opts.service) {
    app.all("/devices*", async (_req, reply) =>
      reply.status(503).send({ message: "Database belum dikonfigurasi (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)" }),
    );
    return;
  }
  await app.register(devicesRoutes, { service: opts.service });
};

export { DevicesRepository, DevicesService };
