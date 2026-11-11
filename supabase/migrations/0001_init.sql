-- Skema awal Signage Control Panel (docs/architecture.md, bagian "Model data").
-- Akses hanya lewat apps/api dengan service role key (ADR-0003), jadi RLS diaktifkan
-- tanpa policy: klien anon/authenticated tidak bisa membaca atau menulis apa pun.

create extension if not exists pgcrypto;

create table public.contents (
  id         uuid primary key default gen_random_uuid(),
  judul      text not null check (length(btrim(judul)) > 0),
  tipe       text not null check (tipe in ('text', 'image', 'video', 'url')),
  payload    text not null,
  created_at timestamptz not null default now()
);

create table public.devices (
  id                uuid primary key default gen_random_uuid(),
  nama              text not null check (length(btrim(nama)) > 0),
  lokasi            text not null default '',
  status            text not null default 'offline' check (status in ('online', 'offline')),
  last_seen         timestamptz,
  token_hash        text not null unique,
  pushed_content_id uuid references public.contents (id) on delete set null,
  created_at        timestamptz not null default now()
);

create table public.playlist_items (
  id               uuid primary key default gen_random_uuid(),
  device_id        uuid not null references public.devices (id) on delete cascade,
  content_id       uuid not null references public.contents (id) on delete restrict,
  position         integer not null check (position >= 0),
  duration_seconds integer not null default 10 check (duration_seconds > 0),
  unique (device_id, position) deferrable initially deferred
);

create index playlist_items_device_id_idx on public.playlist_items (device_id, position);
create index playlist_items_content_id_idx on public.playlist_items (content_id);

alter table public.contents       enable row level security;
alter table public.devices        enable row level security;
alter table public.playlist_items enable row level security;
