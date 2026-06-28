require('dotenv').config();
const admin = require('firebase-admin');

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
  console.log('Removendo docs de knockout com nomes antigos do Firestore...');
  for (const name of OLD_DOCS) {
    const ref = db.collection('rodadas').doc(name);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
      console.log(`  Deletado: ${name}`);
    } else {
      console.log(`  Não encontrado (ok): ${name}`);
    }
  }
  console.log('\nPronto. Reinicie o servidor — os arquivos renomeados serão migrados automaticamente.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
