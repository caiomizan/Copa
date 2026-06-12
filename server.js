require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt  = require('bcryptjs');
const fs      = require('fs');
const path    = require('path');
const { exec } = require('child_process');
const http    = require('http');
const admin   = require('firebase-admin');

const app  = express();
const PORT = process.env.PORT || 3026;
const DEV  = process.env.NODE_ENV !== 'production';
if (!DEV) app.set('trust proxy', 1);

// ── Firebase ─────────────────────────────────────────────────────
admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();
const ADMIN_UN = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();

// ── Helpers Firestore ─────────────────────────────────────────────
const getUsers = async () =>
  (await db.collection('usuarios').get()).docs.map(d => d.data());

const getAllPalpites = async () => {
  const res = {};
  (await db.collection('palpites').get()).docs
    .forEach(d => { res[d.id] = d.data().dados || {}; });
  return res;
};

const getAllMatchLines = async () => {
  const lines = [];
  (await db.collection('rodadas').orderBy('filename').get()).docs.forEach(d =>
    (d.data().text || '').split(/\r?\n/).filter(l => l.trim()).slice(1)
      .forEach(l => lines.push(l))
  );
  return lines;
};

// ── Middleware ───────────────────────────────────────────────────
app.use(express.json({ limit: '4mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'copa2026dev_changeme',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 86400 * 1000, secure: !DEV, httpOnly: true, sameSite: 'lax' },
}));
app.use(express.static(path.join(__dirname, 'public')));

const needAuth  = (q, r, n) => q.session.user ? n() : r.status(401).json({ error: 'Não autenticado' });
const needAdmin = (q, r, n) => q.session.user?.isAdmin ? n() : r.status(403).json({ error: 'Sem permissão' });

// ── Auth ─────────────────────────────────────────────────────────
app.get('/api/auth/status', async (req, res) => {
  const users = await getUsers();
  res.json({ hasUsers: users.length > 0 });
});

app.get('/api/auth/me', (req, res) => {
  req.session.user ? res.json(req.session.user) : res.status(401).json({ error: 'Não autenticado' });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const users = await getUsers();
  const u = users.find(x => x.username.toLowerCase() === (username || '').toLowerCase().trim());
  if (!u || !await bcrypt.compare(password || '', u.passwordHash))
    return res.status(401).json({ error: 'Usuário ou senha incorretos' });
  req.session.user = { username: u.username, isAdmin: u.isAdmin };
  res.json({ username: u.username, isAdmin: u.isAdmin });
});

app.post('/api/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.post('/api/auth/change-password', needAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 4)
    return res.status(400).json({ error: 'Nova senha deve ter no mínimo 4 caracteres' });
  const users = await getUsers();
  const u = users.find(x => x.username === req.session.user.username);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (!await bcrypt.compare(currentPassword || '', u.passwordHash))
    return res.status(401).json({ error: 'Senha atual incorreta' });
  await db.collection('usuarios').doc(u.username)
    .update({ passwordHash: await bcrypt.hash(newPassword, 10) });
  res.json({ ok: true });
});

// ── Usuários ─────────────────────────────────────────────────────
app.get('/api/users', needAuth, needAdmin, async (req, res) => {
  const users = await getUsers();
  res.json(users.map(({ username, isAdmin }) => ({ username, isAdmin })));
});

app.post('/api/users', async (req, res) => {
  const users = await getUsers();
  if (users.length > 0 && !req.session.user?.isAdmin)
    return res.status(403).json({ error: 'Apenas o administrador pode criar contas' });

  const { username, password } = req.body || {};
  const name = (username || '').trim();
  if (name.length < 2 || (password || '').length < 4)
    return res.status(400).json({ error: 'Usuário (mín. 2) e senha (mín. 4) obrigatórios' });
  if (users.find(u => u.username.toLowerCase() === name.toLowerCase()))
    return res.status(400).json({ error: 'Usuário já existe' });

  const isAdmin = name.toLowerCase() === ADMIN_UN;
  await db.collection('usuarios').doc(name).set({
    username: name, passwordHash: await bcrypt.hash(password, 10), isAdmin,
  });

  if (!req.session.user) {
    req.session.user = { username: name, isAdmin };
    return res.json({ username: name, isAdmin });
  }
  res.json({ username: name, isAdmin });
});

app.post('/api/users/:username/reset-password', needAuth, needAdmin, async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 4)
    return res.status(400).json({ error: 'Nova senha deve ter no mínimo 4 caracteres' });
  const ref = db.collection('usuarios').doc(req.params.username);
  if (!(await ref.get()).exists) return res.status(404).json({ error: 'Usuário não encontrado' });
  await ref.update({ passwordHash: await bcrypt.hash(newPassword, 10) });
  res.json({ ok: true });
});

app.delete('/api/users/:username', needAuth, needAdmin, async (req, res) => {
  const target = req.params.username;
  if (target === req.session.user.username)
    return res.status(400).json({ error: 'Não é possível excluir sua própria conta' });
  const ref = db.collection('usuarios').doc(target);
  if (!(await ref.get()).exists) return res.status(404).json({ error: 'Usuário não encontrado' });
  await ref.delete();
  await db.collection('palpites').doc(target).delete();
  res.json({ ok: true });
});

// ── Rodadas (CSV no Firestore) ────────────────────────────────────
app.get('/api/csv', needAuth, async (req, res) => {
  const snap = await db.collection('rodadas').orderBy('filename').get();
  res.json(snap.docs.map(d => ({ filename: d.data().filename, text: d.data().text || '' })));
});

app.post('/api/csv', needAuth, needAdmin, async (req, res) => {
  const { filename, text } = req.body || {};
  if (!filename || !/\.csv$/i.test(filename))
    return res.status(400).json({ error: 'Arquivo inválido' });
  await db.collection('rodadas').doc(filename).set({ filename, text: text || '' });
  res.json({ ok: true });
});

// ── Palpites ─────────────────────────────────────────────────────
app.get('/api/palpites/me', needAuth, async (req, res) => {
  const doc = await db.collection('palpites').doc(req.session.user.username).get();
  res.json(doc.exists ? (doc.data().dados || {}) : {});
});

app.get('/api/palpites/all', needAuth, async (req, res) => {
  res.json(await getAllPalpites());
});

app.post('/api/palpites', needAuth, async (req, res) => {
  const incoming = req.body || {};
  const username = req.session.user.username;
  const existingDoc = await db.collection('palpites').doc(username).get();
  const existing = existingDoc.exists ? (existingDoc.data().dados || {}) : {};

  const locks = {};
  try {
    (await getAllMatchLines()).forEach((line, i) => {
      const cols = line.split(',');
      const [d, mo] = (cols[6] || '').split('/').map(Number);
      const [h, mi] = (cols[7] || '').split(':').map(Number);
      locks[String(i)] = new Date(2026, mo - 1, d, h, mi);
    });
  } catch {}

  const now = new Date();
  const saved = {};
  for (const [id, pal] of Object.entries(incoming)) {
    if (locks[id] && locks[id] <= now) { if (existing[id]) saved[id] = existing[id]; }
    else saved[id] = pal;
  }
  for (const [id, pal] of Object.entries(existing)) {
    if (locks[id] && locks[id] <= now && !saved[id]) saved[id] = pal;
  }

  await db.collection('palpites').doc(username).set({ dados: saved });
  res.json({ ok: true });
});

// ── Bolão leaderboard ────────────────────────────────────────────
app.get('/api/bolao', needAuth, async (req, res) => {
  const [allPals, lines] = await Promise.all([getAllPalpites(), getAllMatchLines()]);
  const results = {};
  lines.forEach((line, i) => {
    const cols = line.split(',');
    let p1 = (cols[1] || '').trim(), p2 = (cols[2] || '').trim();
    if (/^\d+x\d+$/i.test(p1)) { [p1, p2] = p1.split(/x/i); }
    if (p1 !== '' && p2 !== '') results[String(i)] = { p1: +p1, p2: +p2 };
  });

  const sig = v => v.p1 > v.p2 ? 1 : v.p1 < v.p2 ? -1 : 0;
  const board = Object.entries(allPals).map(([username, pals]) => {
    let pts = 0, exatos = 0, resultado = 0;
    for (const [id, pal] of Object.entries(pals)) {
      const r = results[id]; if (!r) continue;
      if (pal.p1 === r.p1 && pal.p2 === r.p2) { pts += 3; exatos++; }
      else if (sig(pal) === sig(r))             { pts += 1; resultado++; }
    }
    return { username, pts, exatos, resultado };
  }).sort((a, b) => b.pts - a.pts || b.exatos - a.exatos);

  res.json(board);
});

// ── Admin: backup ────────────────────────────────────────────────
app.get('/api/admin/backup', needAuth, needAdmin, async (req, res) => {
  const [users, palpites] = await Promise.all([getUsers(), getAllPalpites()]);
  res.setHeader('Content-Disposition', 'attachment; filename="backup-copa.json"');
  res.json({ users, palpites });
});

app.get('/api/admin/dados/:file', needAuth, needAdmin, async (req, res) => {
  const { file } = req.params;
  if (!['users.json', 'palpites.json'].includes(file))
    return res.status(403).json({ error: 'Acesso negado' });
  res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
  res.json(file === 'users.json' ? await getUsers() : await getAllPalpites());
});

// ── Start ────────────────────────────────────────────────────────
const server = http.createServer(app);
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    const url = `http://127.0.0.1:${PORT}`;
    console.log(`\nPorta em uso. Abrindo ${url}\n`);
    exec(`start ${url}`);
    process.exit(0);
  } else throw err;
});

async function startup() {
  console.log('\n⚽  Copa 2026 Bolão — iniciando...');

  // Migra CSVs locais para o Firestore na primeira execução
  const rodadasSnap = await db.collection('rodadas').limit(1).get();
  if (rodadasSnap.empty) {
    const localDir = path.join(__dirname, 'dados');
    try {
      const csvFiles = fs.readdirSync(localDir).filter(f => /\.csv$/i.test(f)).sort();
      for (const f of csvFiles) {
        const text = fs.readFileSync(path.join(localDir, f), 'utf8');
        await db.collection('rodadas').doc(f).set({ filename: f, text });
        console.log(`  Rodada migrada: ${f}`);
      }
    } catch { /* sem CSVs locais para migrar */ }
  }

  // Auto-cria admin
  const adminPass = process.env.ADMIN_PASSWORD;
  if (adminPass) {
    const users = await getUsers();
    if (!users.find(u => u.username.toLowerCase() === ADMIN_UN)) {
      const adminName = process.env.ADMIN_USERNAME || 'admin';
      await db.collection('usuarios').doc(adminName).set({
        username: adminName,
        passwordHash: bcrypt.hashSync(adminPass, 10),
        isAdmin: true,
      });
      console.log(`  Admin "${adminName}" criado automaticamente.`);
    }
  }

  server.listen(PORT, DEV ? '127.0.0.1' : '0.0.0.0', () => {
    console.log(`  Rodando na porta ${PORT}\n`);
    if (DEV) exec(`start http://127.0.0.1:${PORT}`);
  });
}

startup().catch(err => { console.error('Erro fatal na inicialização:', err); process.exit(1); });
