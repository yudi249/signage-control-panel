# Presence ditentukan dengan heartbeat dan timeout, last_seen ditulis hemat

Device Client mengirim heartbeat berkala; server menandai Device Offline bila socket tertutup atau tidak ada heartbeat dalam batas waktu. Status Online hanya benar jika koneksi benar-benar hidup, karena koneksi yang mati diam-diam (jaringan putus) tidak memicu event close. `last_seen` di Postgres tidak ditulis pada setiap heartbeat, melainkan saat Device menjadi Online, saat menjadi Offline, dan paling sering sekali per menit selama Online, supaya heartbeat tidak membanjiri database. Saat server start, semua Device di-reset ke Offline karena state memori hilang bersama proses sebelumnya.

## Considered Options

- **Hanya event socket close**: sederhana, tetapi tidak mendeteksi koneksi yang putus tanpa penutupan.
