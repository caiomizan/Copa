require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt  = require('bcryptjs');
const fs      = require('fs');
const path    = require('path');
const { exec } = require('child_process');
const http    = require('http');

const app  = express();
const PORT = process.env.PORT || 3026;
const DEV  = process.env.NODE_ENV !== 'production';
if (!DEV) app.set('trust proxy', 1); // Render/Heroku: proxy HTTPS→HTTP
const DATA     = path.join(__dirname, 'dados');
const USERS    = path.join(DATA, 'users.json');
const PALPITES = path.join(DATA, 'palpites.json');

function getCSVFiles() {
  try { return fs.readdirSync(DATA).filter(f => /\.csv$/i.test(f)).sort(); }
  catch { return []; }
}
function getAllMatchLines() {
  return getCSVFiles().flatMap(f => {
    try {
      return fs.readFileSync(path.join(DATA, f), 'utf8')
        .split(/\r?\n/).filter(l => l.trim()).slice(1);
    } catch { return []; }
  });
}
const ADMIN_UN = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();

const load = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const dump = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2), 'utf8');

// ── Init data files ──────────────────────────────────────────────
fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(USERS))    fs.writeFileSync(USERS,    '[]');
if (!fs.existsSync(PALPITES)) fs.writeFileSync(PALPITES, '{}');

// Auto-cria admin se ADMIN_PASSWORD estiver definido e usuário ainda não existir
function bootstrapAdmin() {
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass) return;
  const users = load(USERS, []);
  if (users.find(u => u.username.toLowerCase() === ADMIN_UN)) return;
  const adminName = process.env.ADMIN_USERNAME || 'admin';
  users.push({ username: adminName, passwordHash: bcrypt.hashSync(adminPass, 10), isAdmin: true });
  dump(USERS, users);
  console.log(`  Admin "${adminName}" criado automaticamente.`);
}
bootstrapAdmin();

// ── Middleware ───────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
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
app.get('/api/auth/status', (req, res) => {
  res.json({ hasUsers: load(USERS, []).length > 0 });
});

app.get('/api/auth/me', (req, res) => {
  req.session.user ? res.json(req.session.user) : res.status(401).json({ error: 'Não autenticado' });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const users = load(USERS, []);
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
  const users = load(USERS, []);
  const u = users.find(x => x.username === req.session.user.username);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (!await bcrypt.compare(currentPassword || '', u.passwordHash))
    return res.status(401).json({ error: 'Senha atual incorreta' });
  u.passwordHash = await bcrypt.hash(newPassword, 10);
  dump(USERS, users);
  res.json({ ok: true });
});

// ── Users (admin creates accounts) ──────────────────────────────
app.get('/api/users', needAuth, needAdmin, (req, res) => {
  res.json(load(USERS, []).map(({ username, isAdmin }) => ({ username, isAdmin })));
});

// POST /api/users: admin-only after first user is created
app.post('/api/users', async (req, res) => {
  const users = load(USERS, []);
  // Allow if no users yet (first = admin bootstrap) OR caller is admin
  if (users.length > 0 && !req.session.user?.isAdmin)
    return res.status(403).json({ error: 'Apenas o administrador pode criar contas' });

  const { username, password } = req.body || {};
  const name = (username || '').trim();
  if (name.length < 2 || (password || '').length < 4)
    return res.status(400).json({ error: 'Usuário (mín. 2) e senha (mín. 4) obrigatórios' });
  if (users.find(u => u.username.toLowerCase() === name.toLowerCase()))
    return res.status(400).json({ error: 'Usuário já existe' });

  const isAdmin = name.toLowerCase() === ADMIN_UN;
  users.push({ username: name, passwordHash: await bcrypt.hash(password, 10), isAdmin });
  dump(USERS, users);

  // If no session yet (admin bootstrapping themselves), log them in
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
  const users = load(USERS, []);
  const u = users.find(x => x.username === req.params.username);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
  u.passwordHash = await bcrypt.hash(newPassword, 10);
  dump(USERS, users);
  res.json({ ok: true });
});

app.delete('/api/users/:username', needAuth, needAdmin, (req, res) => {
  const target = req.params.username;
  if (target === req.session.user.username)
    return res.status(400).json({ error: 'Não é possível excluir sua própria conta' });
  let users = load(USERS, []);
  const before = users.length;
  users = users.filter(u => u.username !== target);
  if (users.length === before) return res.status(404).json({ error: 'Usuário não encontrado' });
  dump(USERS, users);
  // Remove their palpites too
  const all = load(PALPITES, {});
  delete all[target];
  dump(PALPITES, all);
  res.json({ ok: true });
});

// ── CSV ──────────────────────────────────────────────────────────
app.get('/api/csv', needAuth, (req, res) => {
  res.json(getCSVFiles().map(f => {
    try { return { filename: f, text: fs.readFileSync(path.join(DATA, f), 'utf8') }; }
    catch { return { filename: f, text: '' }; }
  }));
});

app.post('/api/csv', needAuth, needAdmin, (req, res) => {
  const { filename, text } = req.body || {};
  if (!filename || !/\.csv$/i.test(filename))
    return res.status(400).json({ error: 'Arquivo inválido' });
  try {
    fs.writeFileSync(path.join(DATA, path.basename(filename)), text || '', 'utf8');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Palpites ─────────────────────────────────────────────────────
app.get('/api/palpites/me', needAuth, (req, res) => {
  res.json(load(PALPITES, {})[req.session.user.username] || {});
});

app.get('/api/palpites/all', needAuth, (req, res) => {
  res.json(load(PALPITES, {}));
});

app.post('/api/palpites', needAuth, (req, res) => {
  const incoming = req.body || {};
  const all  = load(PALPITES, {});
  const existing = all[req.session.user.username] || {};

  // Parse match lock times from all CSV files (global sequential IDs)
  const locks = {};
  try {
    getAllMatchLines().forEach((line, i) => {
      const cols = line.split(',');
      const [d, mo] = (cols[6] || '').split('/').map(Number);
      const [h, mi] = (cols[7] || '').split(':').map(Number);
      locks[String(i)] = new Date(2026, mo - 1, d, h, mi);
    });
  } catch {}

  const now = new Date();
  const saved = {};
  for (const [id, pal] of Object.entries(incoming)) {
    if (locks[id] && locks[id] <= now) {
      // Match locked — keep whatever was already saved
      if (existing[id]) saved[id] = existing[id];
    } else {
      saved[id] = pal;
    }
  }
  // Preserve locked matches not included in this request
  for (const [id, pal] of Object.entries(existing)) {
    if (locks[id] && locks[id] <= now && !saved[id]) saved[id] = pal;
  }

  all[req.session.user.username] = saved;
  dump(PALPITES, all);
  res.json({ ok: true });
});

// ── Bolão leaderboard ────────────────────────────────────────────
app.get('/api/bolao', needAuth, (req, res) => {
  const allPals = load(PALPITES, {});
  const lines = getAllMatchLines();
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

// ── Admin: backup / restore ──────────────────────────────────────
app.get('/api/admin/backup', needAuth, needAdmin, (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="backup-copa.json"');
  res.json({ users: load(USERS, []), palpites: load(PALPITES, {}) });
});

// Serve each raw data file individually (para scripts de sincronização)
app.get('/api/admin/dados/:file', needAuth, needAdmin, (req, res) => {
  const allowed = ['users.json', 'palpites.json'];
  const { file } = req.params;
  if (!allowed.includes(file)) return res.status(403).json({ error: 'Acesso negado' });
  try { res.type('application/json').send(fs.readFileSync(path.join(DATA, file), 'utf8')); }
  catch { res.json(file === 'users.json' ? [] : {}); }
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
server.listen(PORT, DEV ? '127.0.0.1' : '0.0.0.0', () => {
  console.log(`\n⚽  Copa 2026 Bolão rodando na porta ${PORT}\n`);
  if (DEV) exec(`start http://127.0.0.1:${PORT}`);
});
