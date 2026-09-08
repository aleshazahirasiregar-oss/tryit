const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const MIN_WITHDRAW = parseInt(process.env.MIN_WITHDRAW || '25000', 10);
const MAX_WITHDRAW = parseInt(process.env.MAX_WITHDRAW || '2000000', 10);
const DISBURSEMENT_MODE = process.env.DISBURSEMENT_MODE || 'manual';

router.get('/withdraw', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
    [req.user.id]
  );
  res.render('withdraw', {
    user: req.user,
    history: rows,
    error: null,
    minWithdraw: MIN_WITHDRAW,
    maxWithdraw: MAX_WITHDRAW
  });
});

router.post('/withdraw', requireAuth, async (req, res) => {
  const amount = parseInt(req.body.amount, 10);
  const { destination, destination_detail } = req.body;

  const renderError = async (msg) => {
    const { rows } = await pool.query(
      'SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    return res.render('withdraw', {
      user: req.user, history: rows, error: msg,
      minWithdraw: MIN_WITHDRAW, maxWithdraw: MAX_WITHDRAW
    });
  };

  if (!amount || amount < MIN_WITHDRAW) return renderError(`Minimal penarikan Rp${MIN_WITHDRAW.toLocaleString('id-ID')}.`);
  if (amount > MAX_WITHDRAW) return renderError(`Maksimal penarikan Rp${MAX_WITHDRAW.toLocaleString('id-ID')} per transaksi.`);
  if (!destination || !destination_detail) return renderError('Lengkapi tujuan pencairan.');
  if (amount > req.user.balance) return renderError('Saldo kamu tidak cukup.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Kunci baris user supaya tidak ada race condition saldo dobel-tarik
    const { rows: userRows } = await client.query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    if (userRows[0].balance < amount) {
      await client.query('ROLLBACK');
      return renderError('Saldo kamu tidak cukup.');
    }

    await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, req.user.id]);

    const { rows: wRows } = await client.query(
      `INSERT INTO withdrawals (user_id, amount, destination, destination_detail, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
      [req.user.id, amount, destination, destination_detail]
    );
    const withdrawalId = wRows[0].id;

    await client.query(
      `INSERT INTO wallet_ledger (user_id, amount, type, reference_id, note)
       VALUES ($1, $2, 'withdrawal', $3, 'Penarikan saldo')`,
      [req.user.id, -amount, withdrawalId]
    );

    await client.query('COMMIT');

    // Jika mode otomatis dan Xendit dikonfigurasi, langsung panggil API disbursement.
    // Kalau gagal di sini, status tetap 'pending' dan bisa diproses ulang manual oleh admin.
    if (DISBURSEMENT_MODE === 'auto' && process.env.XENDIT_SECRET_KEY) {
      try {
        await triggerXenditDisbursement(withdrawalId, req.user, amount, destination, destination_detail);
      } catch (disbErr) {
        console.error('Xendit disbursement gagal, menunggu proses manual admin:', disbErr.message);
      }
    }

    res.redirect('/withdraw?requested=1');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    renderError('Terjadi kesalahan saat memproses penarikan.');
  } finally {
    client.release();
  }
});

// Memanggil Xendit Disbursement API untuk transfer beneran ke bank/e-wallet user.
// Butuh XENDIT_SECRET_KEY yang valid dan akun Xendit yang sudah lolos verifikasi bisnis (KYB).
async function triggerXenditDisbursement(withdrawalId, user, amount, destination, destinationDetail) {
  const { Xendit } = require('xendit-node');
  const xenditClient = new Xendit({ secretKey: process.env.XENDIT_SECRET_KEY });

  const payload = {
    externalId: `withdrawal-${withdrawalId}`,
    amount,
    bankCode: destination === 'bank' ? destinationDetail.bankCode : destinationDetail.ewalletChannel,
    accountHolderName: user.full_name,
    accountNumber: destinationDetail.accountNumber,
    description: `Pencairan saldo cashback #${withdrawalId}`
  };

  const result = await xenditClient.Disbursement.createDisbursement({ data: payload });

  await pool.query(
    `UPDATE withdrawals SET status = 'processing', xendit_ref_id = $1, processed_at = NOW() WHERE id = $2`,
    [result.id, withdrawalId]
  );
}

module.exports = router;
