import type { Content, CreateContent, UpdateContent } from "@signage/shared";
import { notFound } from "../../platform/errors.ts";
import type { ContentsRepository } from "./contents.repository.ts";

export class ContentsService {
  private readonly repo: ContentsRepository;

  constructor(repo: ContentsRepository) {
    this.repo = repo;
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
    const deleted = await this.repo.delete(id);
    if (!deleted) throw notFound("Content");
  }
}
