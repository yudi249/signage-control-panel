import type { CreateDevice, Device, UpdateDevice } from "@signage/shared";
import { notFound } from "../../platform/errors.ts";
import type { DevicesRepository } from "./devices.repository.ts";

export class DevicesService {
  private readonly repo: DevicesRepository;

  constructor(repo: DevicesRepository) {
    this.repo = repo;
  }

  list(): Promise<Device[]> {
    return this.repo.list();
  }

  async get(id: string): Promise<Device> {
    const device = await this.repo.findById(id);
    if (!device) throw notFound("Device");
    return device;
  }

  create(input: CreateDevice): Promise<Device> {
    return this.repo.create(input);
  }

  async update(id: string, input: UpdateDevice): Promise<Device> {
    const device = await this.repo.update(id, input);
    if (!device) throw notFound("Device");
    return device;
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repo.delete(id);
    if (!deleted) throw notFound("Device");
  }
}
