# Device Client desktop — Windows

Aplikasi Electron memuat halaman Device Client dari origin web yang dikonfigurasi. Server web dan API harus sudah berjalan; installer tidak menyertakan server atau UI web lokal.

## Menjalankan dev

1. Jalankan `pnpm install` pada root workspace. Workspace mengizinkan skrip instalasi Electron. Jika cache instalasi lama belum memiliki binary Electron, jalankan `pnpm --filter @signage/desktop exec node node_modules/electron/install.js`.
2. Siapkan environment API seperti `.env.example`, lalu jalankan `pnpm dev:api`.
3. Jalankan `pnpm --filter @signage/web dev`. Catat alamat Vite yang ditampilkan, karena port dapat berubah.
4. Jalankan `pnpm dev:desktop` pada terminal lain.
5. Pada pengaturan desktop, isi origin web (contoh `http://localhost:5173`) dan UUID Device yang sudah dibuat di Dashboard. Setelah disimpan, masukkan device token pada form Device Client.

Di komputer lain, gunakan hostname/IP server yang dapat dijangkau, bukan localhost komputer tersebut. Server web perlu menyajikan route SPA `/device/:id` dan meneruskan `/api` serta `/ws` ke API. Origin tidak boleh memakai subpath, query, fragment, atau kredensial. HTTPS dianjurkan pada deployment; aplikasi tidak melewati error sertifikat.

## Pengoperasian

- Device Client langsung fullscreen, termasuk form token. F11 toggle; Escape keluar fullscreen.
- Menu Aplikasi → Pengaturan atau Ctrl+, membuka form lokal. Batal kembali ke Device sebelumnya; Simpan mengganti konfigurasi.
- Hapus data pemasangan meminta konfirmasi dan menghapus seluruh konfigurasi/data situs/token profil aplikasi, bukan data browser biasa.
- Konfigurasi tersimpan di direktori userData Electron sebagai `device-config.json`; token hanya berada dalam profil browser persisten aplikasi per origin.
- Satu instance aktif. Membuka aplikasi kedua mengaktifkan jendela yang sudah ada.
- Kegagalan load utama atau timeout 15 detik menampilkan pemulihan lokal; retry setelah 10 detik atau Coba lagi. Kegagalan API/WS setelah halaman terbuka memakai pemulihan Device Client, tanpa reload oleh desktop.
- Video autoplay dengan audio; atur volume melalui Windows. X/Alt+F4 menutup aplikasi sepenuhnya.

## Pengujian dan packaging

```powershell
pnpm --filter @signage/desktop test
pnpm --filter @signage/desktop test:smoke
pnpm build:desktop
pnpm dist:desktop
```

Smoke test menjalankan Electron nyata dengan server lokal dan profil sementara. Build unpacked dan installer Windows x64 dibuat di `apps/desktop/dist/`. Jalankan installer .exe, lalu verifikasi pemasangan, buka/tutup, persistensi token, fullscreen, dan pengaturan pada Windows target. Installer belum ditandatangani; Windows dapat menampilkan peringatan penerbit tidak dikenal.

Tidak termasuk: tray, autostart, kiosk terkunci, auto-update, code signing, multimonitor, macOS/Linux, bundling UI, dan caching media offline.
