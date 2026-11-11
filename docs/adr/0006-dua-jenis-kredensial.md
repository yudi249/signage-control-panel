# Dua jenis kredensial: JWT untuk Admin, device token untuk Device

Admin masuk dengan login dan menerima JWT yang melindungi REST API dan koneksi WebSocket Dashboard. Device tidak mendaftar sendiri: Admin membuat Device di Dashboard, server menerbitkan device token sekali tampil (hanya hash-nya disimpan), dan token itu dimasukkan ke Device Client untuk koneksi WebSocket. Device dengan token tidak dikenal ditolak. Dipilih karena self-register tanpa autentikasi membuat siapa pun bisa menambahkan layar atau meniru Device yang sudah ada.

## Considered Options

- **Self-register tanpa autentikasi**: cepat, tetapi tidak ada kendali atas siapa yang menjadi Device.
- **Satu JWT untuk keduanya**: JWT admin berumur pendek tidak cocok untuk Device yang berjalan tanpa pengawasan dan harus tetap tersambung berhari-hari.

## Consequences

- Token Device yang hilang harus dibuat ulang dari Dashboard (rotasi token).
- Akun admin tunggal dari konfigurasi lingkungan; manajemen banyak admin di luar cakupan.
