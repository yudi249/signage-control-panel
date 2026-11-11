import { DevicesRepository, DevicesService } from "./modules/devices/index.ts";
import type { Db } from "./platform/supabase.ts";

// Satu jalur perakitan agar startup dan buildApp memakai instance yang sama.
export function resolveDevicesService(options: {
  db: Db | null;
  devicesService?: DevicesService | null;
}): DevicesService | null {
  return options.devicesService !== undefined
    ? options.devicesService
    : options.db ? new DevicesService(new DevicesRepository(options.db)) : null;
}
