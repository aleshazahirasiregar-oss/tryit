require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const { loadUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const walletRoutes = require('./routes/wallet');
const adminRoutes = require('./routes/admin');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(loadUser);

app.get('/', (req, res) => {
  if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/dashboard');
  res.render('landing');
});

app.use(authRoutes);
app.use(taskRoutes);
app.use(walletRoutes);
app.use(adminRoutes);

app.use((req, res) => {
  res.status(404).render('error', { message: 'Halaman tidak ditemukan.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
});
