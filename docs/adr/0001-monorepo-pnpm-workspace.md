# Monorepo pnpm workspace dengan paket tipe bersama

Repo berisi `apps/api`, `apps/web`, `apps/desktop`, dan `packages/shared`. Kontrak pesan WebSocket dan bentuk data ditulis sekali di `packages/shared` (skema Zod beserta tipenya) dan diimpor oleh server, dashboard, device client, dan Electron. Dipilih karena pesan WebSocket tidak punya tipe bawaan seperti REST, jadi tanpa paket bersama server dan klien mudah melenceng tanpa ketahuan sampai runtime.

## Considered Options

- **Folder terpisah tanpa workspace**: lebih sederhana disiapkan, tetapi tipe pesan harus diduplikasi.
