const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function looksLikeUrl(str) {
  return /^https?:\/\/.+\..+/i.test(str.trim());
}

router.get('/dashboard', requireAuth, async (req, res) => {
  const { rows: tasks } = await pool.query(`
    SELECT t.*,
      s.status AS my_status,
      (SELECT COUNT(*) FROM submissions s2 WHERE s2.task_id = t.id AND s2.status = 'approved') AS approved_count
    FROM tasks t
    LEFT JOIN submissions s ON s.task_id = t.id AND s.user_id = $1
    WHERE t.is_active = TRUE
    ORDER BY t.created_at DESC
  `, [req.user.id]);

  res.render('dashboard', { tasks, user: req.user });
});

router.get('/tasks/:id/submit', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND is_active = TRUE', [req.params.id]);
  if (!rows[0]) return res.status(404).render('error', { message: 'Tugas tidak ditemukan.' });
  res.render('submit-task', { task: rows[0], error: null });
});

router.post('/tasks/:id/submit', requireAuth, async (req, res) => {
  const taskId = req.params.id;

  const { rows: taskRows } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND is_active = TRUE', [taskId]);
  const task = taskRows[0];
  if (!task) return res.status(404).render('error', { message: 'Tugas tidak ditemukan.' });

  const proof = (req.body.proof_content || '').trim();
  if (proof.length < 3) {
    return res.render('submit-task', { task, error: 'Isi bukti pengerjaan tugas dulu ya.' });
  }
  if ((task.proof_type === 'link' || task.proof_type === 'screenshot_url') && !looksLikeUrl(proof)) {
    return res.render('submit-task', { task, error: 'Bukti harus berupa link yang valid (diawali http:// atau https://).' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (task.max_submissions !== null) {
      const { rows } = await client.query(
        "SELECT COUNT(*) FROM submissions WHERE task_id = $1 AND status != 'rejected'",
        [taskId]
      );
      if (parseInt(rows[0].count, 10) >= task.max_submissions) {
        await client.query('ROLLBACK');
        return res.render('submit-task', { task, error: 'Kuota tugas ini sudah penuh.' });
      }
    }

    const { rows: subRows } = await client.query(
      `INSERT INTO submissions (task_id, user_id, proof_content, status, reviewed_at)
       VALUES ($1, $2, $3, 'approved', NOW()) RETURNING id`,
      [taskId, req.user.id, proof]
    );
    const submissionId = subRows[0].id;

    await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [task.reward_amount, req.user.id]);
    await client.query(
      `INSERT INTO wallet_ledger (user_id, amount, type, reference_id, note)
       VALUES ($1, $2, 'task_reward', $3, 'Reward tugas (auto-approve Bot Mekos)')`,
      [req.user.id, task.reward_amount, submissionId]
    );

    await client.query('COMMIT');
    res.redirect('/dashboard?submitted=1');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.render('submit-task', { task, error: 'Kamu sudah pernah mengirim bukti untuk tugas ini.' });
    }
    console.error(err);
    res.render('submit-task', { task, error: 'Terjadi kesalahan. Coba lagi.' });
  } finally {
    client.release();
  }
});

router.get('/history', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.*, t.title, t.reward_amount
    FROM submissions s
    JOIN tasks t ON t.id = s.task_id
    WHERE s.user_id = $1
    ORDER BY s.created_at DESC
  `, [req.user.id]);
  res.render('history', { submissions: rows });
});

module.exports = router;
