# Supabase hanya diakses lewat backend

Dashboard dan Device Client tidak pernah memanggil Supabase langsung; semuanya lewat REST API dan WebSocket Fastify. Backend memakai service role key dan Row Level Security tidak diandalkan sebagai batas akses. Dipilih karena requirement tes menuntut REST API CRUD, dan otorisasi (JWT admin, device token) cukup dicek di satu tempat. Supabase dipakai sebagai Postgres terkelola dan Storage, bukan sebagai backend-as-a-service.

## Considered Options

- **Dashboard langsung ke Supabase dengan RLS**: kode lebih sedikit, tetapi REST API CRUD kehilangan makna dan aturan akses tersebar di policy SQL.

## Consequences

- Service role key hanya ada di `apps/api` dan tidak boleh masuk bundle klien.
- Fitur realtime Supabase tidak dipakai; pembaruan realtime berasal dari WebSocket server sendiri.
