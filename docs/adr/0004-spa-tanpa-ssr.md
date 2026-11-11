# Frontend SPA React + Vite dengan TanStack, tanpa SSR

Dashboard dan halaman Device Client dibangun sebagai satu SPA React + Vite memakai TanStack Router, Query, Table, dan Form, tanpa SSR. TanStack Start sengaja tidak dipakai: dashboard ini bergantung pada koneksi WebSocket dan data di balik login, jadi SSR tidak memberi manfaat, sementara Start menambah server kedua di samping Fastify dan menyulitkan pembungkusan Electron. Karena SPA dibangun jadi file statis, hasil build yang sama dimuat oleh Electron tanpa server tambahan.

## Considered Options

- **TanStack Start**: fitur SSR dan server functions tidak dibutuhkan, dan batas antara backend Fastify dengan server Start jadi ambigu.
- **React + Vite polos**: paling sederhana, tetapi tanpa routing type-safe dan caching server-state yang membantu.
