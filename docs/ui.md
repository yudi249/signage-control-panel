# Desain Dashboard — tahap 8

Jenis: software, antarmuka operasional Admin untuk pengelolaan layar signage.

## Arah visual dan bahasa

Palet: putih, abu-abu netral, hijau gelap untuk tindakan utama. Warna status membantu membedakan koneksi tanpa mendominasi materi tayangan. Tipografi sans-serif, judul ringkas, tepian konten sejajar, serta ukuran target interaksi minimal 44 px.

Suara: teknis-langsung, bahasa Indonesia, istilah Device, konten, Playlist, dan Push konsisten. Pesan menjelaskan tindakan atau hasil, bukan klaim pemasaran.

## Alur halaman

- **Device:** ringkasan jumlah berdasarkan data API, pencarian nama/lokasi, filter status, daftar Device, Playlist, dan tayangan langsung. Pengaturan sekunder berada pada menu per Device.
- **Pemutaran:** daftar Device hanya menampilkan ringkasan pemutaran dan tombol Atur konten. Modal tersebut memuat pilihan Konten langsung atau Playlist berulang. Konten langsung diterapkan lewat Tayangkan konten (Push). Simpan & gunakan playlist menyimpan susunan terlebih dahulu lalu melepas Push; kegagalan simpan tidak melepas Push. Pemilihan mode atau konten saja tidak mengubah layar; playlist kosong menghasilkan idle.
- **Token:** penggantian token membutuhkan konfirmasi karena token lama langsung berhenti berlaku.
- **Konten langsung:** Pilih dari galeri membuka picker yang sama dengan Playlist, dengan radio untuk pilihan tunggal. Gunakan konten ini memperbarui draft beserta preview; Tayangkan konten tetap diperlukan untuk mengirim Push. Kembali tanpa konfirmasi mempertahankan pilihan sebelumnya.
- **Tambah item Playlist:** tombol Tambah konten membuka galeri pilihan di modal yang sama. Pencarian, filter jenis, dan checkbox mendukung pilihan beberapa konten; pilihan tetap tersimpan saat memfilter. Tambahkan konten mengubah draft Playlist saja, dengan durasi awal 10 detik dan urutan sesuai pilihan. Kembali membatalkan pilihan yang belum ditambahkan; item yang sudah ada boleh ditambahkan kembali. Simpan & gunakan playlist tetap diperlukan untuk menerapkan ke Device.
- **Pustaka konten:** galeri responsif menampilkan gambar, video tanpa autoplay, cuplikan teks, atau domain dan URL (tanpa iframe halaman web). Menu titik tiga per kartu menyediakan detail, ubah, dan hapus; detail video dapat diputar. Upload dan pembuatan teks/URL berada dalam dialog. Pencarian dan filter jenis membantu menemukan materi.
- **Login:** identitas produk dan form dengan label yang terlihat.
- **Dialog:** dirender melalui portal ke body, dengan fokus terkurung, Escape, dan pengembalian fokus ke pemicu. Tinggi dibatasi viewport dan isi dapat digulir.
- **Layar kecil:** navigasi pindah ke atas; baris tabel menjadi daftar satu kolom dengan label per nilai. Tidak memerlukan geser horizontal untuk tindakan Device.

## Penerapan panduan visual

Panduan tasteskill menjadi acuan keterbacaan, warna, respons interaksi, dan aksesibilitas. Resep landing page seperti hero satu layar, section pemasaran satu layar, shader, dan momen scroll tidak diterapkan pada daftar operasional: pengguna perlu melihat data dan menjalankan tugas langsung. Tidak ada foto stok, angka pelanggan, atau data operasional rekaan.

## Pemeriksaan

Pemeriksa landing page yang membuka `/devices` tanpa sesi Admin diarahkan ke login. Hasil pemeriksaan itu tidak mewakili Dashboard terautentikasi. Tangkapan layar login tersedia secara lokal di `.taste-skill/shots/`; verifikasi daftar dengan sesi Admin tetap diperlukan untuk menilai isi data nyata.
