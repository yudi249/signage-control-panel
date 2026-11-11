import type { FastifyPluginAsync } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { devicesRoutes } from "./devices.routes.ts";
import { DevicesRepository } from "./devices.repository.ts";
import { DevicesService } from "./devices.service.ts";

export interface DevicesModuleOptions {
  db: SupabaseClient | null;
}

export const devicesModule: FastifyPluginAsync<DevicesModuleOptions> = async (app, opts) => {
  void opts.db; // akan dipakai saat route CRUD ditambahkan
  await app.register(devicesRoutes);
};

export { DevicesRepository, DevicesService };
