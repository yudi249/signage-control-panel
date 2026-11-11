# Playlist dimiliki satu Device, Push mengesampingkan Playlist dan bertahan

Setiap Device punya Playlist sendiri (relasi Device ke Playlist Item ke Content), bukan Playlist bersama yang dipakai banyak Device. Push menampilkan satu Content seketika dan tetap berlaku sampai Admin melakukan Release; status Push disimpan di database, sehingga Device yang tersambung ulang tetap menampilkan Content yang di-push. Dipilih agar model dan UI tetap kecil dalam waktu tes, dengan harga: Content yang sama harus ditambahkan ulang ke tiap Device.

## Considered Options

- **Playlist bersama (many-to-many)**: lebih fleksibel, tetapi menambah tabel dan layar kelola tanpa dibutuhkan requirement.
- **Push hanya di memori**: lebih sederhana, tetapi hilang bila Device terputus sebentar atau server restart.
