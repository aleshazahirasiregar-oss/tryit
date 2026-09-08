const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

// Membaca token dari cookie, memuat data user, dan menempelkannya ke req.user
async function loadUser(req, res, next) {
  const token = req.cookies.token;
  res.locals.user = null;
  if (!token) return next();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query(
      'SELECT id, full_name, email, role, balance, is_suspended FROM users WHERE id = $1',
      [payload.userId]
    );
    if (rows[0] && !rows[0].is_suspended) {
      req.user = rows[0];
      res.locals.user = rows[0];
    }
  } catch (err) {
    // token tidak valid/kadaluarsa — anggap belum login
  }
  next();
}

// Wajib login untuk mengakses route ini
function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}

// Wajib role admin untuk mengakses route ini
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).render('error', { message: 'Akses ditolak. Halaman ini khusus admin.' });
  }
  next();
}

module.exports = { loadUser, requireAuth, requireAdmin };
