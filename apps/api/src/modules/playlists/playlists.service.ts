import {
  playlistItemInputSchema,
  replacePlaylistRequestSchema,
  type PlaylistItemResponse,
  type ReplacePlaylistRequest,
} from "@signage/shared";
import { badRequest, notFound } from "../../platform/errors.ts";
import type { NormalizedPlaylistItem, PlaylistsRepository } from "./playlists.repository.ts";

interface DeviceLookup {
  findById(id: string): Promise<unknown | null>;
}
interface ContentLookup {
  findById(id: string): Promise<unknown | null>;
}

export class PlaylistsService {
  private readonly repo: PlaylistsRepository | null;
  private readonly devices: DeviceLookup;
  private readonly contents: ContentLookup;

  constructor(
    repo: PlaylistsRepository | null,
    devices: DeviceLookup,
    contents: ContentLookup,
  ) {
    this.repo = repo;
    this.devices = devices;
    this.contents = contents;
  }

  async get(deviceId: string): Promise<PlaylistItemResponse[]> {
    const device = await this.devices.findById(deviceId);
    if (!device) throw notFound("Device");
    if (!this.repo) return [];
    return this.repo.getResolved(deviceId);
  }

  async getInternal(deviceId: string): Promise<NormalizedPlaylistItem[]> {
    if (!this.repo) return [];
    return this.repo.getInternal(deviceId);
  }

  async replace(deviceId: string, body: ReplacePlaylistRequest): Promise<PlaylistItemResponse[]> {
    const parsed = replacePlaylistRequestSchema.parse(body);
    const device = await this.devices.findById(deviceId);
    if (!device) throw notFound("Device");

    const normalized: NormalizedPlaylistItem[] = [];
    for (let i = 0; i < parsed.items.length; i++) {
      const item = playlistItemInputSchema.parse(parsed.items[i]);
      const content = await this.contents.findById(item.contentId);
      if (!content) throw notFound("Content");
      const duration = item.durationSeconds ?? 10;
      if (!Number.isInteger(duration) || duration <= 0) {
        throw badRequest("Durasi item playlist tidak valid");
      }
      // position from array order, normalized 0..n-1
      normalized.push({ contentId: item.contentId, position: i, durationSeconds: duration });
    }

    if (this.repo) {
      await this.repo.replace(deviceId, normalized);
      return this.repo.getResolved(deviceId);
    }
    // fallback for tests that may not have repo (shouldn't happen) - not expected
    return [];
  }
}
