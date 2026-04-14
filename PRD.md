import os

# Content for the PRD based on the previous conversation
prd_content = """# Product Requirements Document (PRD): ESP32 OTA Management Server

## 1. Visi & Tujuan Produk
Membangun platform internal berbasis web dan REST API yang beroperasi di VPS untuk mengelola, mendistribusikan, dan memonitor pembaruan *firmware* (*Over-The-Air*) secara terpusat untuk seluruh proyek perangkat keras berbasis ESP32.

## 2. Target Pengguna
* **Administrator / Firmware Engineer:** Mengelola proyek, mengunggah *firmware* `.bin`, dan memantau status versi.
* **IoT Devices (ESP32):** Bertindak sebagai *client* yang secara periodik mengecek pembaruan dan mengunduh *firmware* secara otomatis.

---

## 3. Fitur Utama (Core Features)

### A. Manajemen Proyek (Web Dashboard)
* **Create Project:** Menambahkan proyek baru (Contoh: "Smart Home System", "Industrial Sensor v2"). Setiap proyek akan di-generate sebuah `Project_ID` unik.
* **Read/List Project:** Menampilkan daftar semua proyek beserta versi *firmware* terakhir yang aktif (*latest release*).
* **Delete Project:** Menghapus proyek beserta seluruh riwayat *firmware* yang terikat di dalamnya.

### B. Manajemen Firmware (Web Dashboard)
* **Upload Firmware:** Mengunggah file `.bin` hasil kompilasi. Wajib menyertakan input **Versi** (menggunakan *Semantic Versioning*, misal: `v1.0.2`) dan **Catatan Rilis** (*Release Notes*).
* **Firmware Listing:** Melihat riwayat versi *firmware* yang pernah diunggah dalam sebuah proyek.
* **Set Active/Rollback:** Memilih versi *firmware* mana yang saat ini berstatus "Aktif" untuk diunduh oleh *device*. (Penting untuk skenario *rollback* jika versi terbaru ternyata memiliki *bug*).
* **Delete Firmware:** Menghapus file *firmware* lama untuk menghemat *storage* VPS.

### C. Device API Endpoints (Untuk ESP32)
* **Check Update (`GET /api/update/check`):** ESP32 mengirimkan `Project_ID` dan versi saat ini. Server merespons dengan status apakah ada versi yang lebih tinggi.
* **Download Firmware (`GET /api/update/download`):** Endpoint khusus untuk menyajikan file `.bin`. Endpoint ini harus kompatibel dengan *library* standar `HTTPUpdate.h` atau `esp_https_ota` bawaan ESP-IDF/Arduino Core.

---

## 4. Rekomendasi Fitur Tambahan (Expert Suggestions)

1. **Device Authentication & Security:** Menggunakan sistem **API Key** (Token) per proyek atau *whitelisting* berdasarkan **MAC Address** untuk mencegah akses tidak sah ke file `.bin`.
2. **Staged Rollout / A-B Testing:** Fitur untuk merilis *update* hanya ke MAC Address spesifik sebelum dirilis ke seluruh perangkat.
3. **Fleet Monitoring & Log Status:** Dashboard untuk memantau perangkat mana yang berhasil/gagal melakukan *update* melalui log dari perangkat.
4. **MD5 Checksum Verification:** Server mengirimkan hash MD5 agar ESP32 dapat memvalidasi integritas file sebelum proses *flashing*.
5. **Webhook Notifications:** Integrasi ke Telegram atau Email untuk notifikasi jika terjadi kegagalan OTA masal atau rilis baru.

---

## 5. Rancangan Teknis & Arsitektur Sistem

* **Backend Application:** Node.js (Express.js atau NestJS).
* **Database:** PostgreSQL (Direkomendasikan) atau SQLite untuk skala kecil.
* **Storage:** File System lokal VPS atau Object Storage.
* **Deployment:** Docker Containers menggunakan `docker-compose`.
* **Web Server / Proxy:** NGINX dengan sertifikat SSL Let's Encrypt (Wajib menggunakan HTTPS untuk keamanan OTA).
"""

file_path = "ESP32_OTA_Server_PRD.md"

with open(file_path, "w", encoding="utf-8") as f:
    f.write(prd_content)

print(f"File saved as: {file_path}")