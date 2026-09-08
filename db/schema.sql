-- Skema database untuk website cashback tugas/survei
-- Jalankan file ini di database PostgreSQL kamu sebelum start server

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  full_name     VARCHAR(150) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'user', -- 'user' atau 'admin'
  balance       BIGINT NOT NULL DEFAULT 0,           -- saldo dalam Rupiah (integer, tanpa desimal)
  bank_name     VARCHAR(100),
  bank_account  VARCHAR(50),
  ewallet_type  VARCHAR(30),                          -- 'OVO','DANA','GOPAY','LINKAJA', dst
  ewallet_number VARCHAR(30),
  is_suspended  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id            SERIAL PRIMARY KEY,
  title         VARCHAR(200) NOT NULL,
  description   TEXT NOT NULL,
  reward_amount BIGINT NOT NULL,             -- reward dalam Rupiah untuk satu kali submission
  proof_type    VARCHAR(20) NOT NULL DEFAULT 'link', -- 'link', 'text', atau 'screenshot_url'
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  max_submissions INTEGER,                   -- batas total submission diterima, NULL = tanpa batas
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submissions (
  id            SERIAL PRIMARY KEY,
  task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proof_content TEXT NOT NULL,               -- link/teks bukti pengerjaan tugas
  status        VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending','approved','rejected'
  reviewed_by   INTEGER REFERENCES users(id),
  reviewed_at   TIMESTAMP,
  reject_reason TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, user_id) -- satu user hanya bisa submit sekali per tugas
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount          BIGINT NOT NULL,
  destination     VARCHAR(20) NOT NULL,     -- 'bank' atau 'ewallet'
  destination_detail TEXT NOT NULL,         -- nomor rekening/e-wallet tersimpan saat request dibuat
  status          VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending','processing','success','failed'
  xendit_ref_id   VARCHAR(100),
  failure_reason  TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      BIGINT NOT NULL,             -- positif = kredit masuk, negatif = debit keluar
  type        VARCHAR(30) NOT NULL,        -- 'task_reward','withdrawal','adjustment'
  reference_id INTEGER,                    -- id submission atau withdrawal terkait
  note        TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index untuk query yang sering dipakai
CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON wallet_ledger(user_id);

-- Contoh akun admin (ganti password_hash dengan hasil bcrypt kamu sendiri, lihat README)
-- INSERT INTO users (full_name, email, password_hash, role) VALUES ('Admin', 'admin@example.com', '<bcrypt_hash>', 'admin');

-- Contoh beberapa tugas awal
INSERT INTO tasks (title, description, reward_amount, proof_type, max_submissions) VALUES
('Isi Survei Kepuasan Aplikasi', 'Isi survei singkat (5 menit) lalu tempel link konfirmasi selesai di sini.', 3000, 'link', 500),
('Follow & Screenshot Akun Instagram', 'Follow akun Instagram resmi kami, lalu upload screenshot bukti follow ke Google Drive dan tempel link-nya.', 2000, 'screenshot_url', 1000),
('Tulis Review Jujur di Play Store', 'Tulis review minimal 3 kalimat di Play Store, lalu tempel screenshot review-nya.', 5000, 'screenshot_url', 300)
ON CONFLICT DO NOTHING;
