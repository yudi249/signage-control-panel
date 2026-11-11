/**
 * Event bus di dalam proses. Dipakai agar modul yang tidak boleh saling mengimpor
 * (misalnya `presence` dan `playlists`) tetap bisa berkoordinasi (ADR-0008).
 *
 * Daftar event ditambah di sini seiring modul yang membutuhkannya.
 */
export interface AppEvents {
  "device.connected": { deviceId: string };
}

type Handler<K extends keyof AppEvents> = (payload: AppEvents[K]) => void | Promise<void>;

export interface EventBus {
  on<K extends keyof AppEvents>(event: K, handler: Handler<K>): void;
  emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): Promise<void>;
}

export function createEventBus(): EventBus {
  const handlers = new Map<keyof AppEvents, Array<Handler<keyof AppEvents>>>();

  return {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler as Handler<keyof AppEvents>);
      handlers.set(event, list);
    },
    async emit(event, payload) {
      for (const handler of handlers.get(event) ?? []) {
        await handler(payload);
      }
    },
  };
}
