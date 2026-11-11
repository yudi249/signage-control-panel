# Signage Control Panel

Dashboard Admin dan Device Client untuk mengelola tayangan layar signage. Dibuat untuk tes teknis Full Stack MJ Solution Indonesia.

Admin dapat mengelola Device dan pustaka konten, memantau status koneksi secara realtime, menyusun Playlist, serta menayangkan satu konten langsung melalui Push. Device Client tersedia sebagai halaman browser dan aplikasi desktop Windows.

## Daftar isi

- [Fitur](#fitur)
- [Teknologi dan struktur repo](#teknologi-dan-struktur-repo)
- [Prasyarat](#prasyarat)
- [Instalasi dan konfigurasi](#instalasi-dan-konfigurasi)
- [Menjalankan aplikasi](#menjalankan-aplikasi)
- [Panduan penggunaan](#panduan-penggunaan)
- [Pengujian](#pengujian)
- [Build dan deployment](#build-dan-deployment)
- [Pemecahan masalah](#pemecahan-masalah)
- [Batasan dan dokumentasi lanjutan](#batasan-dan-dokumentasi-lanjutan)

## Fitur

- Login Admin menggunakan JWT; kata sandi diverifikasi dengan bcrypt.
- CRUD Device, salin UUID, penerbitan dan penggantian token Device.
- Presence Online/Offline dan Last Seen melalui WebSocket.
- Pustaka konten berbentuk galeri: teks, gambar, video, dan URL halaman web.
- Upload gambar/video ke Supabase Storage, maksimal 50 MB per file.
- Playlist per Device: pilihan konten melalui galeri, urutan, dan durasi per item.
- Konten langsung (Push) dan kembali ke Playlist (Release).
- Video pada mode konten langsung diputar berulang.
- Device Client menyambung kembali otomatis dan menerima sinkronisasi terbaru.
- Desktop Electron: pengaturan origin/Device, fullscreen, profil persisten, dan installer Windows x64.

## Teknologi dan struktur repo

| Bagian | Teknologi |
| --- | --- |
| API | Node.js, TypeScript, Fastify, WebSocket |
| Web | React, Vite, Tailwind CSS, TanStack Router/Query/Table/Form |
| Database dan media | Supabase Postgres dan Storage |
| Kontrak bersama | Zod dan TypeScript |
| Desktop | Electron dan electron-builder |
| Workspace | pnpm |

```text
apps/
  api/                 REST API, autentikasi, repository Supabase, dan presence
  web/                 Dashboard Admin dan halaman Device Client
  desktop/             Pembungkus Electron untuk Device Client
packages/
  shared/              Skema validasi dan tipe yang digunakan bersama
supabase/migrations/   Migrasi database SQL
scripts/               Runner migrasi database
docs/                  Arsitektur, ADR, panduan desktop, dan desain UI
.env.example           Template konfigurasi lokal
```

Browser dan desktop berkomunikasi dengan API melalui aplikasi web. Hanya API yang mengakses Supabase menggunakan service role key. Perintah Admin dikirim melalui REST; WebSocket digunakan untuk presence dan sinkronisasi tayangan.

## Prasyarat

- **Node.js 22.9 atau lebih baru**; gunakan Node.js 24 LTS agar sesuai dengan lingkungan pengembangan proyek.
- **pnpm 10.28.0**, sesuai `packageManager` pada `package.json`.
- Proyek Supabase aktif dengan akses Postgres dan Storage.
- Browser modern. Untuk desktop dan packaging yang ditargetkan proyek ini, gunakan **Windows x64**.
- Koneksi internet untuk memasang dependency dan mengakses Supabase/media eksternal.

## Instalasi dan konfigurasi

Semua perintah berikut dijalankan dari **root repo**, kecuali dinyatakan berbeda. Contoh terminal menggunakan PowerShell.

### 1. Ambil source dan pasang dependency

Clone repository yang diserahkan, lalu buka terminal pada direktori hasil clone:

```powershell
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

Jika pnpm sudah tersedia pada versi yang sesuai, cukup jalankan dua perintah terakhir. Jangan menyimpan `.env` dalam Git.

### 2. Siapkan Supabase

1. Buat atau gunakan satu proyek Supabase.
2. Ambil **Project URL** dan **service role key** dari pengaturan API proyek.
3. Ambil connection string Postgres dari menu **Connect**, lalu isi password database yang benar. Pilih metode koneksi yang dapat dijangkau dari komputer Anda; jika direct connection tidak tersedia karena jaringan IPv6, gunakan koneksi session pooler yang disediakan Supabase.
4. Pada Storage, buat bucket bernama **`contents`** dengan akses **public** untuk pembacaan media. Upload dilakukan melalui API menggunakan kredensial server.

Bucket dibuat terpisah dari migrasi SQL. Nama bucket harus sama dengan `SUPABASE_STORAGE_BUCKET`. URL media pada bucket public dapat dibaca tanpa login; gunakan materi yang memang ditujukan untuk tayangan.

### 3. Isi environment

| Variabel | Isi / kegunaan |
| --- | --- |
| `HOST` | Alamat bind API; default `127.0.0.1` |
| `PORT` | Port API; default `3000` |
| `SUPABASE_URL` | Project URL Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key untuk API, bukan anon/publishable key |
| `SUPABASE_STORAGE_BUCKET` | Nama bucket media; default `contents` |
| `DATABASE_URL` | Connection string Postgres untuk migrasi |
| `ADMIN_USERNAME` | Nama pengguna Admin yang Anda tentukan |
| `ADMIN_PASSWORD_HASH` | Hash bcrypt dari kata sandi Admin |
| `JWT_SECRET` | Secret acak untuk penandatanganan token Admin |

Tidak ada akun Admin bawaan. Akun Admin ini berasal dari environment server, **bukan Supabase Auth**.

Untuk membuat hash dan secret tanpa masalah escaping PowerShell, buka Node REPL:

```powershell
pnpm --filter @signage/api exec node
```

Ketik baris berikut **di prompt Node (`>`)**, bukan di PowerShell. Ganti teks kata sandi dengan kata sandi yang Anda pilih:

```javascript
const bcrypt = await import('bcryptjs');
bcrypt.hashSync('GANTI_DENGAN_KATA_SANDI_ANDA', 12);
(await import('node:crypto')).randomBytes(32).toString('hex');
```

Salin hasil hash ke `ADMIN_PASSWORD_HASH`, dan hasil hex ke `JWT_SECRET`, tanpa tanda kutip pembungkus dari output REPL. Keluar dengan `.exit`. Simpan hash yang mengandung karakter `$` melalui editor `.env` agar tidak terinterpolasi PowerShell. Hash dan JWT secret adalah dua nilai berbeda.

### 4. Terapkan migrasi database

```powershell
pnpm db:migrate
```

Runner membaca `supabase/migrations/` berurutan dan mencatat migrasi dalam `public.schema_migrations`. Menjalankan ulang perintah akan melewati migrasi yang sudah diterapkan. Tabel aplikasi utama: `devices`, `contents`, dan `playlist_items`.

## Menjalankan aplikasi

### API dan Dashboard

Buka dua terminal:

```powershell
# Terminal 1
pnpm dev:api
```

```powershell
# Terminal 2
pnpm --filter @signage/web dev
```

Buka alamat yang ditampilkan Vite, biasanya **`http://localhost:5173`**, lalu login menggunakan akun Admin pada `.env`. Endpoint kesehatan API tersedia di **`http://127.0.0.1:3000/health`**.

Vite meneruskan `/api` dan `/ws` ke API port 3000. Jika `PORT` API diubah, sesuaikan target proxy pada `apps/web/vite.config.ts`. Gunakan port web yang benar-benar ditampilkan terminal karena Vite dapat memilih port lain jika 5173 sudah digunakan.

### Device Client browser

Setelah membuat Device melalui Dashboard, buka:

```text
http://localhost:5173/device/UUID_DEVICE
```

Ganti `UUID_DEVICE` dengan ID yang disalin dari Dashboard, lalu masukkan token Device. Gunakan tab/jendela terpisah agar tayangan dapat diamati bersama Dashboard.

### Device Client desktop

Dengan API dan web tetap berjalan, buka terminal ketiga:

```powershell
pnpm dev:desktop
```

Isi origin web, misalnya `http://localhost:5173`, dan UUID Device. Setelah menyimpan, masukkan token Device pada form pemasangan.

| Kontrol desktop | Tindakan |
| --- | --- |
| `Ctrl+,` atau menu Aplikasi → Pengaturan | Mengganti origin dan UUID Device |
| `F11` | Mengaktifkan/menonaktifkan fullscreen |
| `Escape` | Keluar dari fullscreen |
| Hapus data pemasangan | Menghapus konfigurasi dan data situs/token profil aplikasi setelah konfirmasi |
| X / `Alt+F4` | Menutup aplikasi sepenuhnya |

Konfigurasi dan token bertahan setelah aplikasi ditutup. Desktop memuat web dari server; **installer tidak menyertakan server API maupun web**.

### Mengakses dari komputer lain

Untuk pengujian melalui LAN, jalankan web dengan:

```powershell
pnpm --filter @signage/web dev --host 0.0.0.0
```

Gunakan `http://IP_KOMPUTER_SERVER:PORT_WEB` pada browser atau origin desktop komputer lain. Izinkan port web pada firewall jika diperlukan. API dapat tetap di loopback karena proxy Vite berjalan pada komputer server. `localhost` pada komputer Device menunjuk komputer Device itu sendiri. Pada deployment, gunakan domain/HTTPS dan sertifikat valid.

## Panduan penggunaan

### 1. Daftarkan dan pasangkan layar

1. Pada halaman **Device**, klik **Tambah Device** dan isi nama/lokasi.
2. Salin token yang muncul; token hanya ditampilkan sekali saat diterbitkan.
3. Klik ikon **Salin ID** di samping UUID Device.
4. Buka Device Client browser atau desktop, lalu pasangkan menggunakan UUID dan token tersebut.
5. Status di Dashboard berubah menjadi **Online** tanpa refresh.

Menu **•••** pada Device menyediakan ubah, rotasi token, dan hapus. Rotasi token membuat token lama tidak berlaku untuk autentikasi berikutnya; gunakan token baru untuk pemasangan ulang. Satu Device hanya memiliki satu koneksi aktif: koneksi valid terbaru mengambil alih klien sebelumnya.

### 2. Siapkan pustaka konten

- **Unggah file:** JPEG, PNG, WebP, GIF, MP4, atau WebM, maksimal 50 MB. Sumber media otomatis menjadi URL publik Supabase Storage.
- **Tambah Teks/URL:** buat teks atau masukkan URL halaman web, gambar, maupun video.
- Galeri menampilkan preview media, cuplikan teks, atau domain/URL untuk tautan web.
- Menu **•••** setiap kartu menyediakan **Lihat detail**, **Ubah konten**, dan **Hapus konten**.
- Gunakan pencarian dan filter jenis untuk menemukan materi.

**Video (URL)** membutuhkan URL langsung file video yang didukung browser, misalnya MP4/WebM. Link halaman Google Drive `/preview` atau YouTube bukan sumber file untuk elemen video. Halaman preview dapat dicoba sebagai jenis **URL**, dengan batasan iframe dan autoplay dari penyedia situs. Untuk hasil yang lebih terkontrol, unggah file video melalui aplikasi.

### 3. Tayangkan satu konten langsung

1. Pada Device, klik **Atur konten**.
2. Pilih mode **Konten langsung** → **Pilih dari galeri**.
3. Pilih satu konten dan klik **Gunakan konten ini**.
4. Klik **Tayangkan konten** untuk menerapkan Push.

Konten tetap tampil sampai diganti atau kembali ke Playlist. Video langsung menggunakan loop. Mengubah pilihan di picker belum mengubah layar sebelum tombol penerapan ditekan.

### 4. Susun dan gunakan Playlist

1. Buka **Atur konten** → **Playlist berulang**.
2. Klik **Tambah konten**, cari/filter pada galeri, lalu centang satu atau beberapa materi.
3. Klik **Tambahkan … konten**. Durasi awal setiap item adalah 10 detik.
4. Ubah durasi, atur urutan dengan tombol naik/turun, atau hapus item dari draft.
5. Klik **Simpan & gunakan playlist**.

Playlist disimpan terlebih dahulu, lalu Push dilepas agar Playlist berjalan. Materi yang sama boleh muncul lebih dari sekali. Playlist berpindah berdasarkan durasi item, bukan menunggu video selesai; setelah item terakhir, pemutaran kembali ke awal. Playlist kosong tanpa Push membuat Device idle/menunggu konten.

Konten yang masih digunakan dalam Playlist tidak dapat dihapus dari pustaka. Hapus penggunaannya dari Playlist terlebih dahulu. Menghapus konten yang hanya sedang di-Push akan melepas Push pada Device terkait.

### 5. Pemulihan koneksi

Device Client mencoba menyambung kembali otomatis dengan jeda bertahap. Selama halaman tetap terbuka, sinkronisasi terakhir dipertahankan di memori dan Playlist tetap berjalan; media tetap bergantung pada ketersediaan sumbernya. Setelah tersambung, server mengirim keadaan terbaru. Data ini bukan cache offline permanen dan tidak bertahan setelah reload.

Heartbeat berlangsung setiap 15 detik, dengan watchdog 45 detik. Device yang mati diam-diam dapat memerlukan sekitar satu menit sebelum dinyatakan Offline. Saat API dimulai ulang, status tersimpan direset Offline dan diperbarui ketika Device kembali terhubung.

## Pengujian

### Perintah otomatis

```powershell
# Typecheck workspace dan aturan impor modul backend
pnpm check

# Tes yang tersedia pada seluruh workspace
pnpm -r --if-present test

# Build frontend
pnpm --filter @signage/web build

# Smoke test Electron nyata (profil sementara dan server lokal)
pnpm --filter @signage/desktop test:smoke
```

Smoke test UI Dashboard menggunakan API/WebSocket mock dan memerlukan web dev server pada `http://localhost:5173` serta Microsoft Edge terpasang:

```powershell
node apps/desktop/test/dashboard-dialogs.smoke.mjs
```

Script tersebut memeriksa modal, menu galeri, picker, dan urutan penerapan Push/Playlist tanpa mengubah database nyata. Letaknya di workspace desktop karena menggunakan dependency Playwright yang tersedia di sana.

### Checklist manual end-to-end

| Skenario | Hasil yang diharapkan |
| --- | --- |
| Login salah, lalu benar | Kredensial salah ditolak; akun benar membuka Dashboard |
| Buat Device dan pasangkan token | Device menjadi Online tanpa refresh |
| Upload gambar/video, buat teks | Materi muncul pada galeri dan detail dapat dibuka |
| Susun Playlist 2–3 item berdurasi singkat | Urutan berulang sesuai durasi tersimpan |
| Terapkan Konten langsung | Playlist digantikan; video langsung berulang |
| Simpan & gunakan playlist | Push dilepas dan Playlist berjalan kembali |
| Tutup Device Client | Status berubah Offline; buka lagi menjadi Online |
| Hentikan lalu jalankan API | Device menyambung kembali dan mendapat tayangan terbaru |
| Ubah tayangan saat Device ditutup | Saat dibuka kembali, Device menerima keadaan terbaru |
| Hubungkan dua klien dengan UUID/token sama | Klien terbaru mengambil alih; klien lama berhenti mencoba merebut koneksi |
| Rotasi token, lalu koneksi baru memakai token lama | Autentikasi ditolak; token baru dapat digunakan |
| Hapus konten yang digunakan Playlist | Ditolak sampai item Playlist dihapus dan disimpan |
| Dashboard pada layar kecil | Galeri, menu aksi, dan modal tetap dapat digunakan |
| Jalankan installer pada Windows target | Pemasangan, buka/tutup, fullscreen, dan persistensi konfigurasi berfungsi |

Checklist ini adalah panduan verifikasi penerima, bukan pernyataan bahwa semua langkah telah dijalankan pada setiap komputer target.

## Build dan deployment

### Web dan API

```powershell
pnpm --filter @signage/web build
```

Hasil frontend berada di `apps/web/dist/`. Untuk deployment, sajikan folder tersebut melalui server statis/reverse proxy dengan fallback SPA ke `index.html`, termasuk route `/device/:id`. Teruskan `/api` dan `/ws` ke API; koneksi `/ws` harus mendukung WebSocket upgrade. Proxy development Vite tidak ikut masuk ke hasil build.

Repo belum menyediakan pipeline deployment atau skrip `start` produksi API. Entry point API adalah `apps/api/src/main.ts`; skrip `pnpm dev:api` memakai watch mode untuk pengembangan. Konfigurasikan runtime Node, environment server, dan process manager sesuai lingkungan penerima. Jangan memasukkan service role key atau `DATABASE_URL` ke environment frontend berawalan `VITE_`.

### Desktop Windows x64

```powershell
# Aplikasi unpacked
pnpm build:desktop

# Installer NSIS
pnpm dist:desktop
```

Output berada di `apps/desktop/dist/`. Untuk versi saat ini, installer bernama **`Signage Device Client Setup 0.1.0.exe`**. Artefak dibuat lokal melalui build, bukan disertakan sebagai source Git. Installer belum ditandatangani; Windows dapat menampilkan peringatan penerbit tidak dikenal. Aplikasi terpasang tetap membutuhkan origin web/API yang aktif.

## Pemecahan masalah

| Gejala | Pemeriksaan |
| --- | --- |
| Migrasi gagal | Pastikan `DATABASE_URL`, password, metode koneksi, dan akses jaringan Postgres benar |
| API gagal startup | Periksa `.env`, koneksi Supabase, migrasi, dan log terminal; reset presence startup juga membutuhkan database |
| Login ditolak | Pastikan username benar dan hash merupakan bcrypt dari kata sandi yang dimasukkan; restart API setelah mengubah `.env` |
| Upload gagal | Pastikan bucket `contents` sudah dibuat public, service role key sesuai proyek, format didukung, dan file tidak lebih dari 50 MB |
| Web tidak bisa mengakses API | Pastikan API berjalan di port target proxy Vite; akses Dashboard melalui alamat Vite, bukan port API |
| Device menolak token | Pastikan UUID/token cocok, token belum dirotasi, dan tidak ada spasi tambahan |
| Video/preview tidak dimuat | Coba buka sumber langsung; pastikan URL mengirim file video, bukan halaman berbagi, serta format/codec didukung browser |
| URL halaman web kosong/ditolak | Situs mungkin memblokir iframe melalui CSP atau X-Frame-Options; gunakan halaman yang mengizinkan embedding |
| Video browser tidak autoplay dengan audio | Kebijakan autoplay browser dapat memerlukan interaksi pengguna; desktop dikonfigurasi untuk autoplay |
| Desktop gagal memuat server | Periksa origin dan port, konektivitas/firewall, serta sertifikat; gunakan Ctrl+, untuk mengganti konfigurasi |
| Binary Electron belum terpasang | Jalankan `pnpm --filter @signage/desktop exec node node_modules/electron/install.js`, lalu ulangi dev/build |
| Dashboard kembali ke login setelah API putus | Setelah API aktif kembali, login ulang; pemulihan koneksi otomatis terutama diimplementasikan pada Device Client |

## Batasan dan dokumentasi lanjutan

- Target saat ini puluhan Device dengan satu instance API. Registry koneksi berada di memori; belum ada koordinasi multi-instance.
- Belum ada penyimpanan media offline permanen, transcoding video, atau integrasi khusus Google Drive/YouTube.
- Autentikasi Admin berasal dari environment; belum ada manajemen akun/role melalui UI.
- Desktop ditargetkan Windows x64; belum mencakup autostart, tray, kiosk terkunci, auto-update, code signing, dan multimonitor.

Dokumen teknis:

- [Arsitektur, model data, REST, dan protokol WebSocket](docs/architecture.md)
- [Panduan desktop Windows](docs/desktop.md)
- [Desain dan alur UI Dashboard](docs/ui.md)
- [Glosarium domain](GLOSSARY.md)
- [Architecture Decision Records](docs/adr/)
