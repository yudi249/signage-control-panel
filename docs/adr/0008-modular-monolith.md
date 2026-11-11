# Modular monolith di backend: modul per domain, berlapis di dalam

`apps/api` dideploy sebagai satu proses (monolit) tetapi kodenya dibagi per domain ke dalam modul `auth`, `devices`, `contents`, `playlists`, dan `presence`. Tiap modul berlapis route, service, repository, dan hanya boleh diakses modul lain lewat satu file antarmuka (`index.ts`). Dipilih karena Presence punya state di memori dan timer yang tidak cocok dipaksa masuk ke folder `services/` dan `repositories/`, dan karena kode satu fitur sebaiknya berada di satu tempat. Batas modul ditegakkan dengan aturan impor yang dicek lint, bukan hanya konvensi, supaya tidak berubah menjadi monolit tanpa batas.

## Considered Options

- **Layered murni (dibagi per jenis file)**: paling sederhana, tetapi kode satu fitur tersebar di tiga folder dan Presence tidak punya tempat yang jelas.
- **Microservices**: menyelesaikan masalah skala tim dan beban yang tidak ada di sini, dan memaksa state Presence dibagi lewat Redis (lihat ADR-0002).

## Consequences

- Antarmuka modul harus dijaga kecil. Memperlebarnya demi kemudahan sesaat mengikis batas yang menjadi alasan memilih gaya ini.
- Ketergantungan antar modul tidak boleh membentuk siklus. Arah sebaliknya ditangani dengan event di dalam proses.
- Bila suatu saat Presence perlu dipisah (skala ribuan Device), batasnya sudah ada dan modul itu bisa diekstrak menjadi gateway tersendiri.
