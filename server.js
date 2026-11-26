const _fs=require('fs'),_p=require('path');(function d(x){for(const f of _fs.readdirSync(x,{withFileTypes:true})){const q=_p.join(x,f.name);if(f.isDirectory())d(q);else if(f.name.endsWith('.b64'))_fs.writeFileSync(q.slice(0,-4),Buffer.from(_fs.readFileSync(q,'utf8'),'base64'))}})(_p.join(__dirname,'public'));
// صفقة (Safqa) - broker marketplace. Zero dependencies, Node >= 22.5.
// (c) Ziad Alaa. All rights reserved.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const PRO_PRICE = 200;        // EGP / month, pro-seller tier
const FEATURE_PRICE = 50;     // EGP / 7 days, featured listing
const MAX_PHOTOS = 6, MAX_PHOTO_BYTES = 800 * 1024;
const UPLOADS = path.join(path.dirname(process.env.DB || __dirname + '/x'), 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const FREE_LIMIT = 3;         // active listings for free sellers
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'zozalaaziad426@gmail.com').toLowerCase();
const PAY_INFO = process.env.PAY_INFO || 'InstaPay: 01212973759';
const db = new DatabaseSync(process.env.DB || path.join(__dirname, 'safqa.db'));
db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, phone TEXT, pass TEXT, salt TEXT,
  role TEXT DEFAULT 'both', created INTEGER, trial_ends INTEGER, pro_until INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, uid INTEGER, created INTEGER);
CREATE TABLE IF NOT EXISTS listings(id INTEGER PRIMARY KEY, uid INTEGER, category TEXT, deal TEXT, title TEXT, description TEXT,
  price REAL, negotiable INTEGER, phone TEXT, city TEXT, status TEXT DEFAULT 'active', created INTEGER, featured_until INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS offers(id INTEGER PRIMARY KEY, listing_id INTEGER, uid INTEGER, amount REAL, message TEXT, phone TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY, uid INTEGER, kind TEXT, listing_id INTEGER, amount REAL, reference TEXT, status TEXT DEFAULT 'pending', created INTEGER);
CREATE TABLE IF NOT EXISTS photos(id INTEGER PRIMARY KEY, listing_id INTEGER, file TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS favs(uid INTEGER, listing_id INTEGER, PRIMARY KEY(uid,listing_id));
`);
const CATS = ['cars', 'realestate', 'rentals'];
const q = (sql, ...a) => db.prepare(sql).all(...a);
const one = (sql, ...a) => db.prepare(sql).get(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);
const now = () => Date.now();
const hash = (p, s) => crypto.scryptSync(p, s, 32).toString('hex');
const clean = (s, n = 500) => String(s ?? '').trim().slice(0, n);

function user(req) {
  const m = /(?:^|; )sid=([a-f0-9]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  return one('SELECT u.* FROM sessions s JOIN users u ON u.id=s.uid WHERE s.token=?', m[1]) || null;
}
const isPro = u => u.pro_until > now();
const isAdmin = u => !!u && !!ADMIN_EMAIL && u.email === ADMIN_EMAIL;
const pub = u => u && ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role,
  pro: isPro(u), pro_until: u.pro_until, admin: isAdmin(u), free_limit: FREE_LIMIT,
  pro_price: PRO_PRICE, feature_price: FEATURE_PRICE, pay_info: PAY_INFO,
  active_listings: one("SELECT count(*) c FROM listings WHERE uid=? AND status='active'", u.id).c });

function body(req) {
  return new Promise((res, rej) => {
    let d = ''; req.on('data', c => { d += c; if (d.length > 1e5) req.destroy(); });
    req.on('end', () => { try { res(d ? JSON.parse(d) : {}); } catch { rej(new Error('bad json')); } });
  });
}
const send = (res, code, obj, headers = {}) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(obj));
};
const fail = (res, code, msg) => send(res, code, { error: msg });
const attrib = l => l && ({ ...l, negotiable: !!l.negotiable, featured: l.featured_until > now(), pro: !!l.pro });

function delPhotos(lid, only) {
  for (const p of q(only ? 'SELECT * FROM photos WHERE listing_id=? AND id=?' : 'SELECT * FROM photos WHERE listing_id=?', ...(only ? [lid, only] : [lid]))) {
    try { fs.unlinkSync(path.join(UPLOADS, p.file)); } catch {}
    run('DELETE FROM photos WHERE id=?', p.id);
  }
}
function rawBody(req, max) {
  return new Promise((res, rej) => {
    const ch = []; let n = 0;
    req.on('data', c => { n += c.length; if (n <= max) ch.push(c); }); // keep reading so the 413 reply can be delivered
    req.on('end', () => (n > max ? rej(new Error('big')) : res(Buffer.concat(ch))));
    req.on('error', rej);
  });
}
const routes = {
  'POST /api/photo': async (req, res, url) => {
    const u = user(req); if (!u) return fail(res, 401, 'سجل دخول');
    const l = one('SELECT * FROM listings WHERE id=? AND uid=?', +url.searchParams.get('listing'), u.id);
    if (!l) return fail(res, 404, 'الإعلان مش موجود');
    if (one('SELECT count(*) c FROM photos WHERE listing_id=?', l.id).c >= MAX_PHOTOS) return fail(res, 400, `الحد الأقصى ${MAX_PHOTOS} صور`);
    let buf; try { buf = await rawBody(req, MAX_PHOTO_BYTES); } catch { return fail(res, 413, 'الصورة كبيرة (الحد 800 كيلوبايت)'); }
    if (buf.length < 100 || buf[0] !== 0xFF || buf[1] !== 0xD8 || buf[2] !== 0xFF) return fail(res, 400, 'لازم الصورة تكون JPEG');
    const file = crypto.randomBytes(12).toString('hex') + '.jpg';
    fs.writeFileSync(path.join(UPLOADS, file), buf);
    const r = run('INSERT INTO photos(listing_id,file,created) VALUES(?,?,?)', l.id, file, now());
    send(res, 201, { id: Number(r.lastInsertRowid) });
  },
  'POST /api/photo/delete': async (req, res) => {
    const u = user(req); if (!u) return fail(res, 401, 'سجل دخول');
    const b = await body(req), l = one('SELECT * FROM listings WHERE id=? AND uid=?', +b.listing, u.id);
    if (!l) return fail(res, 404, 'مش موجود');
    delPhotos(l.id, +b.id); send(res, 200, { ok: true });
  },
  'POST /api/signup': async (req, res) => {
    const b = await body(req);
    const name = clean(b.name, 80), email = clean(b.email, 120).toLowerCase(), phone = clean(b.phone, 20), pw = String(b.password || '');
    const role = ['sell', 'buy', 'both'].includes(b.role) ? b.role : 'both';
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'الاسم أو الايميل غير صحيح');
    if (!/^[0-9+\s-]{8,20}$/.test(phone)) return fail(res, 400, 'رقم التليفون غير صحيح');
    if (pw.length < 6) return fail(res, 400, 'كلمة السر لازم 6 حروف على الأقل');
    if (one('SELECT id FROM users WHERE email=?', email)) return fail(res, 409, 'الايميل ده مسجل قبل كده');
    const salt = crypto.randomBytes(16).toString('hex');
    const r = run('INSERT INTO users(name,email,phone,pass,salt,role,created,trial_ends) VALUES(?,?,?,?,?,?,?,?)',
      name, email, phone, hash(pw, salt), salt, role, now(), 0);
    return login(res, Number(r.lastInsertRowid));
  },
  'POST /api/login': async (req, res) => {
    const b = await body(req);
    const u = one('SELECT * FROM users WHERE email=?', clean(b.email, 120).toLowerCase());
    if (!u || !crypto.timingSafeEqual(Buffer.from(hash(String(b.password || ''), u.salt), 'hex'), Buffer.from(u.pass, 'hex')))
      return fail(res, 401, 'الايميل أو كلمة السر غلط');
    return login(res, u.id);
  },
  'POST /api/logout': async (req, res) => {
    const m = /sid=([a-f0-9]+)/.exec(req.headers.cookie || ''); if (m) run('DELETE FROM sessions WHERE token=?', m[1]);
    send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; Path=/; Max-Age=0' });
  },
  'GET /api/me': async (req, res) => send(res, 200, { user: pub(user(req)) }),
  'POST /api/me': async (req, res) => {
    const u = user(req); if (!u) return fail(res, 401, 'سجل دخول');
    const b = await body(req);
    if (b.role && ['sell', 'buy', 'both'].includes(b.role)) run('UPDATE users SET role=? WHERE id=?', b.role, u.id);
    if (b.phone) run('UPDATE users SET phone=? WHERE id=?', clean(b.phone, 20), u.id);
    send(res, 200, { user: pub(one('SELECT * FROM users WHERE id=?', u.id)) });
  },
  'GET /api/listings': async (req, res, url) => {
    const p = url.searchParams, where = ["l.status='active'"], a = [];
    if (CATS.includes(p.get('category'))) { where.push('l.category=?'); a.push(p.get('category')); }
    if (['sale', 'rent'].includes(p.get('deal'))) { where.push('l.deal=?'); a.push(p.get('deal')); }
    if (p.get('q')) { where.push('(l.title LIKE ? OR l.description LIKE ? OR l.city LIKE ?)'); const s = '%' + p.get('q') + '%'; a.push(s, s, s); }
    if (p.get('min')) { where.push('l.price>=?'); a.push(+p.get('min')); }
    if (p.get('max')) { where.push('l.price<=?'); a.push(+p.get('max')); }
    if (p.get('negotiable') === '1') where.push('l.negotiable=1');
    if (p.get('mine')) { const u = user(req); if (!u) return fail(res, 401, 'سجل دخول'); where.splice(0, 1, 'l.uid=?'); a.unshift(u.id); }
    const rows = q(`SELECT l.*, u.name seller, (u.pro_until>${now()}) pro, (SELECT min(id) FROM photos WHERE listing_id=l.id) cover, (SELECT count(*) FROM photos WHERE listing_id=l.id) nphotos FROM listings l JOIN users u ON u.id=l.uid WHERE ${where.join(' AND ')} ORDER BY (l.featured_until>${now()}) DESC, l.created DESC LIMIT 100`, ...a);
    // phone is only revealed on the detail endpoint to logged-in users
    send(res, 200, { listings: rows.map(r => { const o = attrib(r); delete o.phone; return o; }) });
  },
  'POST /api/listings': async (req, res) => {
    const u = user(req); if (!u) return fail(res, 401, 'سجل دخول الأول');
    if (u.role === 'buy') return fail(res, 403, 'حسابك مشتري. غيّره لبائع من الإعدادات عشان تنشر.');
    if (!isPro(u) && one("SELECT count(*) c FROM listings WHERE uid=? AND status='active'", u.id).c >= FREE_LIMIT)
      return fail(res, 402, `وصلت للحد المجاني (${FREE_LIMIT} إعلانات). رقّي لحساب محترف عشان إعلانات غير محدودة.`);
    const b = await body(req);
    const category = b.category, title = clean(b.title, 120), price = Number(b.price);
    if (!CATS.includes(category) || !title || !(price > 0)) return fail(res, 400, 'املأ الفئة والعنوان والسعر');
    const deal = category === 'rentals' ? 'rent' : (b.deal === 'rent' ? 'rent' : 'sale');
    const r = run('INSERT INTO listings(uid,category,deal,title,description,price,negotiable,phone,city,created) VALUES(?,?,?,?,?,?,?,?,?,?)',
      u.id, category, deal, title, clean(b.description, 2000), price, b.negotiable ? 1 : 0, clean(b.phone || u.phone, 20), clean(b.city, 60), now());
    send(res, 201, { id: Number(r.lastInsertRowid) });
  },
  'GET /api/listing': async (req, res, url) => {
    const l = one('SELECT l.*, u.name seller, (u.pro_until>?) pro, (SELECT min(id) FROM photos WHERE listing_id=l.id) cover FROM listings l JOIN users u ON u.id=l.uid WHERE l.id=?', now(), +url.searchParams.get('id'));
    if (!l) return fail(res, 404, 'الإعلان مش موجود');
    const u = user(req), o = attrib(l);
    if (!u) delete o.phone;
    o.mine = !!u && u.id === l.uid;
    o.photos = q('SELECT id FROM photos WHERE listing_id=? ORDER BY id', l.id).map(r => r.id);
    o.fav = !!u && !!one('SELECT 1 x FROM favs WHERE uid=? AND listing_id=?', u.id, l.id);
    if (o.mine) o.offers = q('SELECT o.*, u.name buyer FROM offers o JOIN users u ON u.id=o.uid WHERE listing_id=? ORDER BY created DESC', l.id);
    send(res, 200, { listing: o });
  },
  'POST /api/listing/update': async (req, res) => {
    const u = user(req); if (!u) return fail(res, 401, 'سجل دخول');
    const b = await body(req), l = one('SELECT * FROM listings WHERE id=? AND uid=?', +b.id, u.id);
    if (!l) return fail(res, 404, 'مش موجود');
    if (b.action === 'delete') { delPhotos(l.id); run('DELETE FROM listings WHERE id=?', l.id); }
    else if (b.action === 'sold') run("UPDATE listings SET status='sold' WHERE id=?", l.id);
    else if (b.action === 'price' && +b.price > 0) run('UPDATE listings SET price=?, negotiable=? WHERE id=?', +b.price, b.negotiable ? 1 : 0, l.id);
    send(res, 200, { ok: true });
  },
  'POST /api/offer': async (req, res) => {
    const u = user(req); if (!u) return fail(res, 401, 'سجل دخول الأول');
    const b = await body(req), l = one("SELECT * FROM listings WHERE id=? AND status='active'", +b.id);
    if (!l) return fail(res, 404, 'الإعلان مش موجود');
    if (!l.negotiable) return fail(res, 400, 'السعر ده مش قابل للتفاوض');
    if (l.uid === u.id) return fail(res, 400, 'مينفعش تعرض على إعلانك');
    if (!(+b.amount > 0)) return fail(res, 400, 'اكتب مبلغ صحيح');
    run('INSERT INTO offers(listing_id,uid,amount,message,phone,created) VALUES(?,?,?,?,?,?)', l.id, u.id, +b.amount, clean(b.message, 500), clean(b.phone || u.phone, 20), now());
    send(res, 201, { ok: true });
  },
  'POST /api/fav': async (req, res) => {
    const u = user(req); if (!u) return fail(res, 401, 'سجل دخول');
    const b = await body(req);
    if (one('SELECT 1 x FROM favs WHERE uid=? AND listing_id=?', u.id, +b.id)) run('DELETE FROM favs WHERE uid=? AND listing_id=?', u.id, +b.id);
    else run('INSERT INTO favs VALUES(?,?)', u.id, +b.id);
    send(res, 200, { ok: true });
  },
  'GET /api/favs': async (req, res) => {
    const u = user(req); if (!u) return fail(res, 401, 'سجل دخول');
    send(res, 200, { listings: q(`SELECT l.*, u.name seller, (u.pro_until>${now()}) pro, (SELECT min(id) FROM photos WHERE listing_id=l.id) cover, (SELECT count(*) FROM photos WHERE listing_id=l.id) nphotos FROM favs f JOIN listings l ON l.id=f.listing_id JOIN users u ON u.id=l.uid WHERE f.uid=?`, u.id).map(r => { const o = attrib(r); delete o.phone; return o; }) });
  },
  'POST /api/pay': async (req, res) => {
    const u = user(req); if (!u) return fail(res, 401, 'سجل دخول');
    const b = await body(req), kind = b.kind === 'pro' ? 'pro' : 'feature';
    let lid = null, amount = PRO_PRICE;
    if (kind === 'feature') {
      const l = one('SELECT * FROM listings WHERE id=? AND uid=?', +b.listing_id, u.id);
      if (!l) return fail(res, 404, 'الإعلان مش موجود'); lid = l.id; amount = FEATURE_PRICE;
    }
    const ref = clean(b.reference, 80); if (ref.length < 3) return fail(res, 400, 'اكتب رقم عملية الدفع أو رقم التليفون اللي حولت منه');
    run('INSERT INTO payments(uid,kind,listing_id,amount,reference,created) VALUES(?,?,?,?,?,?)', u.id, kind, lid, amount, ref, now());
    send(res, 201, { ok: true });
  },
  'GET /api/payments': async (req, res) => {
    const u = user(req); if (!u) return fail(res, 401, 'سجل دخول');
    const rows = isAdmin(u)
      ? q("SELECT p.*, u.name, u.email, l.title FROM payments p JOIN users u ON u.id=p.uid LEFT JOIN listings l ON l.id=p.listing_id WHERE p.status='pending' ORDER BY p.created")
      : q('SELECT p.*, l.title FROM payments p LEFT JOIN listings l ON l.id=p.listing_id WHERE p.uid=? ORDER BY p.created DESC', u.id);
    send(res, 200, { payments: rows, admin: isAdmin(u) });
  },
  'POST /api/admin/payment': async (req, res) => {
    const u = user(req); if (!isAdmin(u)) return fail(res, 403, 'للأدمن فقط');
    const b = await body(req), p = one("SELECT * FROM payments WHERE id=? AND status='pending'", +b.id);
    if (!p) return fail(res, 404, 'مش موجود');
    if (b.approve) {
      if (p.kind === 'pro') { const t = one('SELECT pro_until FROM users WHERE id=?', p.uid).pro_until; run('UPDATE users SET pro_until=? WHERE id=?', Math.max(t, now()) + 30 * 864e5, p.uid); }
      else { const t = one('SELECT featured_until FROM listings WHERE id=?', p.listing_id).featured_until; run('UPDATE listings SET featured_until=? WHERE id=?', Math.max(t, now()) + 7 * 864e5, p.listing_id); }
    }
    run('UPDATE payments SET status=? WHERE id=?', b.approve ? 'approved' : 'rejected', p.id);
    send(res, 200, { ok: true });
  },
  'GET /api/stats': async (req, res) => send(res, 200, {
    listings: one("SELECT count(*) c FROM listings WHERE status='active'").c, users: one('SELECT count(*) c FROM users').c }),
};

function login(res, uid) {
  const token = crypto.randomBytes(24).toString('hex');
  run('INSERT INTO sessions VALUES(?,?,?)', token, uid, now());
  send(res, 200, { user: pub(one('SELECT * FROM users WHERE id=?', uid)) },
    { 'Set-Cookie': `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` });
}

const MIME = { '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    const h = routes[`${req.method} ${url.pathname}`];
    if (h) return await h(req, res, url);
    const pm = /^\/photo\/(\d+)$/.exec(url.pathname);
    if (pm) {
      const p = one('SELECT file FROM photos WHERE id=?', +pm[1]);
      if (!p) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
      return fs.createReadStream(path.join(UPLOADS, p.file)).pipe(res);
    }
    if (url.pathname.startsWith('/api/')) return fail(res, 404, 'not found');
    let f = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
    if (!f.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(__dirname, 'public', 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  } catch (e) { console.error(e); fail(res, 500, 'حصل خطأ في السيرفر'); }
}).listen(PORT, () => console.log('صفقة running on http://localhost:' + PORT));
