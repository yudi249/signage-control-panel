import type { CreateDevice, Device, UpdateDevice } from "@signage/shared";
type DeviceWithToken = { device: Device; token: string };
import { notFound } from "../../platform/errors.ts";
import type { DevicesRepository, DeviceWithHash } from "./devices.repository.ts";

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

  findById(id: string): Promise<DeviceWithHash | null> {
    return this.repo.findByIdWithHash(id);
  }

  createWithToken(input: CreateDevice): Promise<DeviceWithToken> {
    return this.repo.createWithToken(input);
  }

  async rotateToken(id: string): Promise<DeviceWithToken> {
    const rotated = await this.repo.rotateToken(id);
    if (!rotated) throw notFound("Device");
    return rotated;
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

  async setPresence(id: string, status: "online" | "offline"): Promise<Device | null> {
    return this.repo.setPresence(id, status);
  }

  async setActiveContent(id: string, pushedContentId: string | null): Promise<Device | null> {
    return this.repo.setActiveContent(id, pushedContentId);
  }

  async listPushedByContent(contentId: string): Promise<Device[]> {
    return this.repo.listPushedByContent(contentId);
  }
}
