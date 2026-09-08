// Jalankan: node db/make-admin-hash.js "passwordkamu"
// Lalu tempel hasilnya ke perintah SQL INSERT admin di schema.sql / psql
const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
  console.log('Pakai: node db/make-admin-hash.js "passwordkamu"');
  process.exit(1);
}

bcrypt.hash(password, 10).then((hash) => {
  console.log('\nPassword hash (bcrypt):');
  console.log(hash);
  console.log('\nContoh SQL untuk bikin admin:');
  console.log(`INSERT INTO users (full_name, email, password_hash, role) VALUES ('Admin', 'admin@email-kamu.com', '${hash}', 'admin');\n`);
});
