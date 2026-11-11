import type { FastifyPluginAsync } from "fastify";
import type { Db } from "../../platform/supabase.ts";
import type { EventBus } from "../../platform/events.ts";
import type { DevicesService } from "../devices/index.ts";
import { PresenceService } from "./presence.service.ts";

interface ContentsApi {
  findById?(id: string): Promise<unknown>;
  get?(id: string): Promise<unknown>;
}

interface PlaylistsApi {
  get(deviceId: string): Promise<any[]>;
}

export interface PresenceModuleOptions {
  db: Db | null;
  events: EventBus;
  devicesService: DevicesService | null;
  contentsService?: ContentsApi | null;
  playlistsService?: PlaylistsApi | null;
  service?: PresenceService;
}

export const presenceModule: FastifyPluginAsync<PresenceModuleOptions> = async (app, opts) => {
  const service =
    opts.service ??
    new PresenceService(
      app,
      opts.db,
      opts.devicesService,
      (opts.contentsService as any) ?? null,
      (opts.playlistsService as any) ?? null,
    );
  void opts.events;

  app.get("/ws/device", { websocket: true }, (socket) => {
    void service.handleDeviceSocket(socket);
  });

  app.get("/ws/admin", { websocket: true }, (socket) => {
    void service.handleAdminSocket(socket);
  });
};

export { PresenceService };
