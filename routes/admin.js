const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/admin', async (req, res) => {
  const { rows: pendingSubs } = await pool.query(`
    SELECT s.*, t.title, t.reward_amount, u.full_name, u.email
    FROM submissions s
    JOIN tasks t ON t.id = s.task_id
    JOIN users u ON u.id = s.user_id
    WHERE s.status = 'pending'
    ORDER BY s.created_at ASC
  `);
  const { rows: pendingWithdrawals } = await pool.query(`
    SELECT w.*, u.full_name, u.email
    FROM withdrawals w
    JOIN users u ON u.id = w.user_id
    WHERE w.status IN ('pending', 'processing')
    ORDER BY w.created_at ASC
  `);
  res.render('admin', { pendingSubs, pendingWithdrawals });
});

// Approve submission tugas -> kredit saldo user
router.post('/admin/submissions/:id/approve', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      SELECT s.*, t.reward_amount FROM submissions s
      JOIN tasks t ON t.id = s.task_id
      WHERE s.id = $1 AND s.status = 'pending' FOR UPDATE
    `, [req.params.id]);
    const sub = rows[0];
    if (!sub) { await client.query('ROLLBACK'); return res.redirect('/admin'); }

    await client.query(
      `UPDATE submissions SET status = 'approved', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2`,
      [req.user.id, sub.id]
    );
    await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [sub.reward_amount, sub.user_id]);
    await client.query(
      `INSERT INTO wallet_ledger (user_id, amount, type, reference_id, note)
       VALUES ($1, $2, 'task_reward', $3, 'Reward tugas disetujui')`,
      [sub.user_id, sub.reward_amount, sub.id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
  } finally {
    client.release();
  }
  res.redirect('/admin');
});

router.post('/admin/submissions/:id/reject', async (req, res) => {
  await pool.query(
    `UPDATE submissions SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), reject_reason = $2
     WHERE id = $3 AND status = 'pending'`,
    [req.user.id, req.body.reason || 'Tidak sesuai ketentuan tugas', req.params.id]
  );
  res.redirect('/admin');
});

// Tandai penarikan sudah ditransfer manual (dipakai jika DISBURSEMENT_MODE=manual)
router.post('/admin/withdrawals/:id/mark-success', async (req, res) => {
  await pool.query(
    `UPDATE withdrawals SET status = 'success', processed_at = NOW() WHERE id = $1`,
    [req.params.id]
  );
  res.redirect('/admin');
});

// Batalkan penarikan & kembalikan saldo ke user (misalnya data rekening salah)
router.post('/admin/withdrawals/:id/refund', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM withdrawals WHERE id = $1 AND status IN ('pending','processing') FOR UPDATE`,
      [req.params.id]
    );
    const w = rows[0];
    if (!w) { await client.query('ROLLBACK'); return res.redirect('/admin'); }

    await client.query(
      `UPDATE withdrawals SET status = 'failed', failure_reason = $1, processed_at = NOW() WHERE id = $2`,
      [req.body.reason || 'Dibatalkan admin', w.id]
    );
    await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [w.amount, w.user_id]);
    await client.query(
      `INSERT INTO wallet_ledger (user_id, amount, type, reference_id, note)
       VALUES ($1, $2, 'adjustment', $3, 'Pengembalian saldo: penarikan dibatalkan')`,
      [w.user_id, w.amount, w.id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
  } finally {
    client.release();
  }
  res.redirect('/admin');
});

module.exports = router;
