const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Dashboard: daftar tugas + status milik user
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

// Form submit bukti tugas
router.get('/tasks/:id/submit', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND is_active = TRUE', [req.params.id]);
  if (!rows[0]) return res.status(404).render('error', { message: 'Tugas tidak ditemukan.' });
  res.render('submit-task', { task: rows[0], error: null });
});

router.post('/tasks/:id/submit', requireAuth, async (req, res) => {
  const { proof_content } = req.body;
  const taskId = req.params.id;

  const { rows: taskRows } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND is_active = TRUE', [taskId]);
  const task = taskRows[0];
  if (!task) return res.status(404).render('error', { message: 'Tugas tidak ditemukan.' });

  if (!proof_content || proof_content.trim().length < 3) {
    return res.render('submit-task', { task, error: 'Isi bukti pengerjaan tugas dulu ya.' });
  }

  try {
    // Cek kuota maksimum submission yang sudah disetujui
    if (task.max_submissions !== null) {
      const { rows } = await pool.query(
        "SELECT COUNT(*) FROM submissions WHERE task_id = $1 AND status != 'rejected'",
        [taskId]
      );
      if (parseInt(rows[0].count, 10) >= task.max_submissions) {
        return res.render('submit-task', { task, error: 'Kuota tugas ini sudah penuh.' });
      }
    }

    await pool.query(
      `INSERT INTO submissions (task_id, user_id, proof_content) VALUES ($1, $2, $3)`,
      [taskId, req.user.id, proof_content.trim()]
    );
    res.redirect('/dashboard?submitted=1');
  } catch (err) {
    if (err.code === '23505') { // unique_violation: sudah pernah submit
      return res.render('submit-task', { task, error: 'Kamu sudah pernah mengirim bukti untuk tugas ini.' });
    }
    console.error(err);
    res.render('submit-task', { task, error: 'Terjadi kesalahan. Coba lagi.' });
  }
});

// Riwayat submission milik user
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
