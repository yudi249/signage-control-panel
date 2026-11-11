# Signage Control Panel

Sistem untuk mengelola layar digital (signage) dari jarak jauh: admin mendaftarkan layar, mengatur konten yang tampil, dan memantau apakah layar sedang terhubung.

## Language

**Admin**:
Orang yang mengoperasikan sistem lewat Dashboard dan satu-satunya yang boleh mengubah data.
_Avoid_: User, operator, pengguna

**Dashboard**:
Antarmuka tempat Admin mengelola Device, Content, dan Playlist serta memantau Presence.
_Avoid_: Admin panel, console

**Device**:
Satu layar signage yang terdaftar di sistem, dengan nama dan lokasi.
_Avoid_: Screen, display, player, terminal

**Device Client**:
Program yang berjalan di sebuah Device untuk menampilkan Content.
_Avoid_: Player, kiosk, agent

**Content**:
Satu bahan tampilan yang bisa ditampilkan di Device (teks, gambar, video, atau halaman web).
_Avoid_: Media, asset, slide

**Playlist**:
Urutan Content yang diputar berulang di satu Device.
_Avoid_: Schedule, queue, program

**Playlist Item**:
Satu Content di dalam Playlist, lengkap dengan posisi dan lama tampil.
_Avoid_: Entry, slot

**Push**:
Perintah Admin agar satu Device langsung menampilkan Content tertentu, mengesampingkan Playlist.
_Avoid_: Override, broadcast, send

**Release**:
Perintah Admin untuk mengakhiri Push sehingga Device kembali memutar Playlist-nya.
_Avoid_: Unpush, reset

**Presence**:
Keadaan sebuah Device, Online atau Offline, menurut apakah Device Client-nya sedang terhubung.
_Avoid_: Health, availability, liveness

**Online**:
Presence saat Device Client terhubung dan masih aktif.
_Avoid_: Active, connected, alive

**Offline**:
Presence saat Device Client tidak terhubung atau berhenti merespons.
_Avoid_: Inactive, disconnected, dead

**Last Seen**:
Waktu terakhir sebuah Device diketahui Online.
_Avoid_: Last active, last ping
