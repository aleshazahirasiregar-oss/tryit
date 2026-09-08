# Tugasin — Website Cashback Tugas/Survei

Website tempat user menyelesaikan tugas (survei, follow, review, dll), mendapat saldo,
dan bisa mencairkan saldo itu ke rekening bank / e-wallet asli.

Tema visual: hijau emerald (`#2F6F5E`) dengan aksen gold, tipografi Fraunces (judul) + Inter (isi).

## Fitur

- Registrasi & login user (password di-hash dengan bcrypt, session pakai JWT di cookie)
- Daftar tugas aktif, submit bukti pengerjaan (link/screenshot)
- Panel admin untuk approve/reject submission → saldo otomatis masuk saat disetujui
- Penarikan saldo ke bank/e-wallet, dengan integrasi **Xendit Disbursement API** untuk transfer beneran
- Mode manual: admin bisa proses transfer sendiri dulu (aman untuk mulai skala kecil) sebelum aktifkan mode otomatis
- Buku besar saldo (`wallet_ledger`) untuk audit trail tiap perubahan saldo
- Satu user hanya bisa submit satu kali per tugas (mencegah spam/duplikasi)

## Cara menjalankan

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Siapkan database PostgreSQL**
   Bisa pakai Supabase, Neon, Railway, atau server sendiri. Lalu jalankan:
   ```bash
   psql "$DATABASE_URL" -f db/schema.sql
   ```

3. **Salin `.env.example` jadi `.env`** dan isi:
   - `DATABASE_URL` — connection string database kamu
   - `JWT_SECRET` — string acak panjang (misal hasil `openssl rand -hex 32`)
   - `XENDIT_SECRET_KEY` — hanya perlu kalau mau pencairan otomatis (lihat bagian Xendit di bawah)
   - `DISBURSEMENT_MODE` — `manual` (disarankan di awal) atau `auto`

4. **Buat akun admin pertama**
   ```bash
   node db/make-admin-hash.js "passwordAdminKamu"
   ```
   Salin hasil SQL yang ditampilkan, jalankan di database kamu.

5. **Jalankan server**
   ```bash
   npm start
   ```
   Buka `http://localhost:3000`

## Soal Xendit (pencairan saldo beneran)

Untuk benar-benar mengirim uang ke rekening/e-wallet user, kamu perlu:

1. Daftar akun bisnis di [xendit.co](https://xendit.co) dan lolos verifikasi KYB (Know Your Business) — ini butuh dokumen legalitas usaha.
2. Ambil API key dari dashboard Xendit, isi ke `XENDIT_SECRET_KEY`.
3. Set `DISBURSEMENT_MODE=auto` di `.env` kalau mau transfer terjadi otomatis begitu user request. Kalau masih `manual`, permintaan pencairan akan menunggu di panel admin sampai kamu tandai "Sudah Ditransfer" secara manual.
4. Cek dokumentasi resmi Xendit Disbursement API untuk daftar `bankCode`/channel e-wallet yang didukung, karena ini bisa berubah.

**Sebelum live dengan uang asli**, disarankan mulai dengan `DISBURSEMENT_MODE=manual` dulu supaya kamu bisa cek manual tiap transaksi sampai yakin sistemnya jalan benar.

## Hal penting soal legalitas (Indonesia)

Website yang mengumpulkan dana dan mencairkan uang ke rekening user termasuk aktivitas
**jasa keuangan/pembayaran**, yang di Indonesia diatur oleh Bank Indonesia (BI) dan/atau OJK.
Beberapa hal yang perlu kamu cek sebelum jalan dengan uang asli dalam skala besar:

- Apakah model bisnismu butuh izin sebagai Penyelenggara Jasa Pembayaran (PJP) atau cukup jadi merchant di atas penyedia berizin (seperti Xendit/Midtrans yang sudah punya izin BI).
- Aturan tentang platform yang memberi imbalan uang untuk "menyelesaikan tugas" — pastikan tugasnya legal dan tidak mengarah ke skema click-farm/bot atau penipuan pihak ketiga (misal follow palsu, review palsu berbayar yang melanggar ToS platform lain).
- Kewajiban pajak atas penghasilan yang kamu terima dari model bisnis ini.
- Perlindungan data pribadi user (UU PDP) — data rekening/e-wallet user harus disimpan dan diproses dengan aman.

Ini bukan nasihat hukum — sebaiknya konsultasi ke konsultan legal/akuntan sebelum meluncurkan produk ini secara komersial.

## Anti-fraud dasar yang sudah ada

- Satu user hanya bisa submit satu kali per tugas (unique constraint di database)
- Semua submission butuh approval admin sebelum saldo cair (tidak otomatis)
- Kuota maksimum submission per tugas (`max_submissions`) untuk kontrol budget
- Ledger transaksi (`wallet_ledger`) untuk audit jika ada saldo yang janggal

Yang **belum** ada dan sebaiknya kamu tambahkan sebelum skala besar:
- Verifikasi email saat registrasi
- Rate limiting / captcha di form registrasi & submission (mencegah bot daftar massal)
- Deteksi multi-akun dari device/IP yang sama
- Verifikasi identitas (KYC) untuk penarikan di atas nominal tertentu

## Struktur folder

```
cashback-app/
├── db/
│   ├── schema.sql          # skema database + contoh data tugas
│   └── make-admin-hash.js  # helper bikin password admin
├── middleware/
│   └── auth.js             # cek login & role admin
├── routes/
│   ├── auth.js             # register/login/logout
│   ├── tasks.js            # daftar tugas & submit bukti
│   ├── wallet.js           # penarikan saldo + integrasi Xendit
│   └── admin.js            # review submission & proses pencairan
├── views/                  # tampilan EJS
├── public/css/style.css    # desain
├── server.js                # entry point
└── .env.example
```
