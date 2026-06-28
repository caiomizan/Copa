require('dotenv').config();
const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

const _sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!_sa) { console.error('FIREBASE_SERVICE_ACCOUNT não definida.'); process.exit(1); }
admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(Buffer.from(_sa, 'base64').toString('utf8'))
  ),
});
const db = admin.firestore();

const OLD_DOCS = [
  'Copa 2026 - 16-avos de final.csv',
  'Copa 2026 - Final.csv',
  'Copa 2026 - Oitavas de final.csv',
  'Copa 2026 - Quartas de final.csv',
  'Copa 2026 - Semifinais.csv',
  'Copa 2026 - Terceiro lugar.csv',
];

async function main() {
  // 1. Remove docs de knockout com nomes antigos
  console.log('\n1. Removendo rodadas knockout com nomes antigos do Firestore...');
  for (const name of OLD_DOCS) {
    const ref  = db.collection('rodadas').doc(name);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
      console.log(`   Deletado: ${name}`);
    } else {
      console.log(`   Não encontrado (ok): ${name}`);
    }
  }

  // 2. Restaura palpites do backup
  const backupPath = path.join(__dirname, 'dados', 'palpites.json');
  if (!fs.existsSync(backupPath)) {
    console.log('\n2. Backup não encontrado em dados/palpites.json — palpites não restaurados.');
  } else {
    console.log('\n2. Restaurando palpites do backup...');
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    for (const [username, dados] of Object.entries(backup)) {
      await db.collection('palpites').doc(username).set({ dados });
      console.log(`   Restaurado: ${username} (${Object.keys(dados).length} palpites)`);
    }
  }

  console.log('\nPronto! Reinicie o servidor — os arquivos renomeados (Rodada 04–09) serão migrados automaticamente.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
