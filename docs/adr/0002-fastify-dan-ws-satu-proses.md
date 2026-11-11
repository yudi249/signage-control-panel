# REST dan WebSocket dalam satu proses Fastify dengan `ws`

Backend berupa satu proses Node.js (TypeScript) dengan Fastify untuk REST dan `ws` mentah untuk WebSocket, berbagi port dan modul yang sama. Dipilih `ws` mentah, bukan Socket.IO, supaya protokol, heartbeat, dan reconnection dikerjakan dan terlihat eksplisit, sesuai penilaian pemahaman konsep real-time. Konsekuensinya, state koneksi (siapa yang online) disimpan di memori proses, sehingga sistem hanya berjalan sebagai satu instance. Ini sengaja diterima untuk skala tes ini, dan menambah instance menuntut pub/sub (misalnya Redis).

## Considered Options

- **Express + Socket.IO**: reconnection dan rooms sudah tersedia, tetapi menyembunyikan mekanisme yang justru ingin ditunjukkan.
- **NestJS**: struktur modular rapi, tetapi boilerplate besar untuk waktu pengerjaan 4–5 hari.
- **Server WebSocket terpisah dari REST**: batas lebih tegas, tetapi dua proses harus berbagi state presence.

## Consequences

- Satu instance saja; tidak ada skala horizontal tanpa perubahan arsitektur.
- Saat proses restart, semua koneksi putus dan Device Client harus menyambung ulang (ditangani reconnection).
