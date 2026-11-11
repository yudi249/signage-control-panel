import { buildApp, type BuildAppOptions } from "./app.ts";
import { DevicesRepository, DevicesService } from "./modules/devices/index.ts";

// Hanya jalur startup proses yang mereset Presence; buildApp tetap bebas efek reset.
export async function startServer(
  options: BuildAppOptions,
  dependencies: { buildApp: typeof buildApp } = { buildApp },
): Promise<void> {
  const devicesService = options.devicesService !== undefined
    ? options.devicesService
    : options.db ? new DevicesService(new DevicesRepository(options.db)) : null;
  const app = await dependencies.buildApp({ ...options, devicesService });
  try {
    if (devicesService) await devicesService.resetAllOffline();
  } catch (error) {
    app.log.error({ err: error }, "Startup gagal: reset Presence Device ke Offline tidak berhasil");
    await app.close();
    throw error;
  }
  const address = await app.listen({ host: options.config.HOST, port: options.config.PORT });
  app.log.info({ address, supabase: options.db !== null }, "api listening");
}
