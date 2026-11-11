import type { Content, CreateContent, UpdateContent } from "@signage/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

interface ContentRow {
  id: string;
  judul: string;
  tipe: Content["tipe"];
  payload: string;
  created_at: string;
}

const CONTENT_COLUMNS = "id,judul,tipe,payload,created_at";

function toContent(row: ContentRow): Content {
  return {
    id: row.id,
    judul: row.judul,
    tipe: row.tipe,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

export class ContentsRepository {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async list(): Promise<Content[]> {
    const { data, error } = await this.db
      .from("contents")
      .select(CONTENT_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as ContentRow[]).map(toContent);
  }

  async findById(id: string): Promise<Content | null> {
    const { data, error } = await this.db
      .from("contents")
      .select(CONTENT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toContent(data as ContentRow) : null;
  }

  async create(input: CreateContent): Promise<Content> {
    const { data, error } = await this.db
      .from("contents")
      .insert({ judul: input.judul, tipe: input.tipe, payload: input.payload })
      .select(CONTENT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return toContent(data as ContentRow);
  }

  async update(id: string, input: UpdateContent): Promise<Content | null> {
    const patch: Record<string, unknown> = {};
    if (input.judul !== undefined) patch.judul = input.judul;
    if (input.tipe !== undefined) patch.tipe = input.tipe;
    if (input.payload !== undefined) patch.payload = input.payload;
    if (Object.keys(patch).length === 0) return this.findById(id);
    const { data, error } = await this.db
      .from("contents")
      .update(patch)
      .eq("id", id)
      .select(CONTENT_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toContent(data as ContentRow) : null;
  }

  async delete(id: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("contents")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data !== null;
  }
}
