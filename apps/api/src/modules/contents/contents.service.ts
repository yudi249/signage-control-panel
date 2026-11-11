import type { Content, CreateContent, UpdateContent } from "@signage/shared";
import { badRequest, notFound } from "../../platform/errors.ts";
import type { ContentsRepository } from "./contents.repository.ts";

export interface ContentDeleteIntegrity {
  isReferencedInPlaylist(contentId: string): Promise<boolean>;
  releasePushedContent(contentId: string): Promise<string[]>;
  notifyDevices(deviceIds: string[]): Promise<void>;
}

export class ContentsService {
  private readonly repo: ContentsRepository;
  private deleteIntegrity: ContentDeleteIntegrity | null = null;

  constructor(repo: ContentsRepository) {
    this.repo = repo;
  }

  setDeleteIntegrity(integrity: ContentDeleteIntegrity | null): void {
    this.deleteIntegrity = integrity;
  }

  list(): Promise<Content[]> {
    return this.repo.list();
  }

  async get(id: string): Promise<Content> {
    const content = await this.repo.findById(id);
    if (!content) throw notFound("Content");
    return content;
  }

  async findById(id: string): Promise<Content | null> {
    return this.repo.findById(id);
  }

  create(input: CreateContent): Promise<Content> {
    return this.repo.create(input);
  }

  async update(id: string, input: UpdateContent): Promise<Content> {
    const content = await this.repo.update(id, input);
    if (!content) throw notFound("Content");
    return content;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw notFound("Content");

    if (this.deleteIntegrity) {
      if (await this.deleteIntegrity.isReferencedInPlaylist(id)) {
        throw badRequest(
          "Content masih digunakan di playlist. Lepas Content dari semua playlist terlebih dahulu sebelum menghapus.",
        );
      }
      const affectedDeviceIds = await this.deleteIntegrity.releasePushedContent(id);
      const deleted = await this.repo.delete(id);
      if (!deleted) throw notFound("Content");
      if (affectedDeviceIds.length > 0) {
        await this.deleteIntegrity.notifyDevices(affectedDeviceIds);
      }
      return;
    }

    const deleted = await this.repo.delete(id);
    if (!deleted) throw notFound("Content");
  }
}
