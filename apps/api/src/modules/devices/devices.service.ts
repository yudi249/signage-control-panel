import type { Device } from "@signage/shared";
import type { DevicesRepository } from "./devices.repository.ts";

export class DevicesService {
  private readonly repo: DevicesRepository;

  constructor(repo: DevicesRepository) {
    this.repo = repo;
  }

  list(): Promise<Device[]> {
    return this.repo.list();
  }
}
