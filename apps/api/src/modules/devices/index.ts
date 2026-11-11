import type { FastifyPluginAsync } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { devicesRoutes } from "./devices.routes.ts";
import { DevicesRepository } from "./devices.repository.ts";
import { DevicesService } from "./devices.service.ts";

interface ContentsLookup {
  get?(id: string): Promise<unknown>;
  findById?(id: string): Promise<unknown>;
}

interface PresenceNotifier {
  sendSync(deviceId: string, pushedContentId?: string | null): Promise<void>;
  disconnectDevice?(deviceId: string, reason?: string): Promise<void> | void;
}

export interface DevicesModuleOptions {
  db: SupabaseClient | null;
  service?: DevicesService;
  contentsService?: ContentsLookup | null;
  presenceService?: PresenceNotifier | null;
}

export const devicesModule: FastifyPluginAsync<DevicesModuleOptions> = async (app, opts) => {
  if (!opts.service) {
    app.all("/devices*", async (_req, reply) =>
      reply.status(503).send({ message: "Database belum dikonfigurasi (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)" }),
    );
    return;
  }
  await app.register(devicesRoutes, {
    service: opts.service,
    contentsService: opts.contentsService ?? null,
    presenceService: opts.presenceService ?? null,
  });
};

export { DevicesRepository, DevicesService };
