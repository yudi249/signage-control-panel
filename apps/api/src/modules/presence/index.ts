import type { FastifyPluginAsync } from "fastify";
import type { Db } from "../../platform/supabase.ts";
import type { EventBus } from "../../platform/events.ts";
import type { DevicesService } from "../devices/index.ts";
import { PresenceService } from "./presence.service.ts";

export interface PresenceModuleOptions {
  db: Db | null;
  events: EventBus;
  devicesService: DevicesService | null;
}

export const presenceModule: FastifyPluginAsync<PresenceModuleOptions> = async (app, opts) => {
  const service = new PresenceService(app, opts.db, opts.devicesService);
  void opts.events;

  app.get("/ws/device", { websocket: true }, (socket) => {
    void service.handleDeviceSocket(socket);
  });

  app.get("/ws/admin", { websocket: true }, (socket) => {
    void service.handleAdminSocket(socket);
  });
};
