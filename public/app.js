const $ = s => document.querySelector(s), app = $('#app');
const CAT = { cars: ['🚗', 'عربيات'], realestate: ['🏠', 'عقارات'], rentals: ['🔑', 'إيجارات'] };
const ROLE = { sell: 'بائع', buy: 'مشتري', both: 'بيع وشراء' };
let me = null;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => Number(n).toLocaleString('ar-EG') + ' ج.م';
async function api(p, data) {
  const r = await fetch('/api/' + p, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
  const j = await r.json(); if (!r.ok) throw new Error(j.error || 'خطأ'); return j;
}
async function loadMe() {
  me = (await api('me')).user;
  $('#nav').innerHTML = me
    ? `<a href="#/browse">تصفح</a><a href="#/plans">الباقات</a><a href="#/mine">إعلاناتي</a><a href="#/favs">المفضلة</a><a href="#/account">${esc(me.name)}</a><a class="cta" href="#/new">+ أضف إعلان</a>`
    : `<a href="#/browse">تصفح</a><a href="#/plans">الباقات</a><a href="#/login">دخول</a><a class="cta" href="#/signup">حساب جديد</a>`;
  $('#banner').innerHTML = me && me.pro ? `<div class="b">✔ حساب محترف</div>` : '';
}
function card(l) {
  return `<a class="card ${l.featured ? 'feat' : ''}" href="#/l/${l.id}"><div class="thumb">${CAT[l.category][0]}</div><div class="in">
  <h3>${esc(l.title)}</h3><div class="price">${money(l.price)}${l.deal === 'rent' ? ' <small>/ شهر</small>' : ''}</div>
  <div>${l.featured ? '<span class="tag f">⭐ مميز</span>' : ''}${l.pro ? '<span class="tag p">✔ محترف</span>' : ''}${l.negotiable ? '<span class="tag">قابل للتفاوض</span>' : '<span class="tag g">سعر ثابت</span>'}<span class="tag g">${CAT[l.category][1]}</span>${l.status === 'sold' ? '<span class="tag s">تم</span>' : ''}</div>
  <div class="small">📍 ${esc(l.city || '—')} · ${esc(l.seller || '')}</div></div></a>`;
}
const need = () => { if (!me) { location.hash = '#/login'; return true; } };

function payForm(kind, listing_id) {
  $('#payform').innerHTML = `<div class="panel"><h3>${kind === 'pro' ? 'اشتراك محترف: ' + me.pro_price : 'تمييز إعلان: ' + me.feature_price} ج.م</h3>
  <p>1) حوّل المبلغ على: <b>${esc(me.pay_info)}</b><br>2) اكتب رقم العملية أو رقم التليفون اللي حولت منه. هنراجع ونفعّل الخدمة.</p>
  <form id="pf" class="row"><input name="reference" placeholder="رقم العملية / رقم التحويل" required><button class="btn gold">تم التحويل</button></form><p class="err" id="e"></p></div>`;
  $('#pf').onsubmit = async e => { e.preventDefault(); try { await api('pay', { kind, listing_id, reference: new FormData(e.target).get('reference') }); pages.plans(); } catch (x) { $('#e').textContent = x.message; } };
  $('#payform').scrollIntoView();
}
const pages = {
  async home() {
    const st = await api('stats'), { listings } = await api('listings');
    app.innerHTML = `<div class="hero"><h1>صفقة. بيع واشتري بسهولة</h1><p>عربيات، عقارات، وإيجارات. اعرض بسعرك وخلي المشتري يفاوضك.</p>
    <a class="btn gold" href="${me ? '#/new' : '#/signup'}">${me ? 'أضف إعلان' : 'ابدأ مجانًا'}</a> <a class="btn ghost" href="#/browse">تصفح الإعلانات</a>
    <p class="small" style="color:#b9c6e6;margin-top:14px">${st.listings} إعلان · ${st.users} عضو</p></div>
    <div class="cats">${Object.entries(CAT).map(([k, v]) => `<a class="cat" href="#/browse?category=${k}"><span class="e">${v[0]}</span>${v[1]}</a>`).join('')}</div>
    <h2>أحدث الإعلانات</h2><div class="grid">${listings.slice(0, 6).map(card).join('') || '<p class="mut">لسه مفيش إعلانات. كن أول واحد!</p>'}</div>`;
  },
  async browse(qs) {
    const p = new URLSearchParams(qs);
    app.innerHTML = `<h2>تصفح الإعلانات</h2><div class="cats">${Object.entries(CAT).map(([k, v]) => `<a class="cat ${p.get('category') === k ? 'on' : ''}" href="#/browse?category=${k}"><span class="e">${v[0]}</span>${v[1]}</a>`).join('')}</div>
    <form class="filters" id="f"><input name="q" placeholder="ابحث..." value="${esc(p.get('q') || '')}"><input name="min" type="number" placeholder="أقل سعر" value="${esc(p.get('min') || '')}">
    <input name="max" type="number" placeholder="أعلى سعر" value="${esc(p.get('max') || '')}">
    <select name="negotiable"><option value="">كل الأسعار</option><option value="1" ${p.get('negotiable') ? 'selected' : ''}>قابل للتفاوض فقط</option></select>
    <input type="hidden" name="category" value="${esc(p.get('category') || '')}"><button class="btn">بحث</button></form><div id="res" class="grid"></div>`;
    $('#f').onsubmit = e => { e.preventDefault(); const d = new URLSearchParams(new FormData(e.target)); [...d.keys()].forEach(k => !d.get(k) && d.delete(k)); location.hash = '#/browse?' + d; };
    const { listings } = await api('listings?' + p);
    $('#res').innerHTML = listings.map(card).join('') || '<p class="mut">مفيش نتائج.</p>';
  },
  async l(id) {
    const { listing: l } = await api('listing?id=' + id);
    app.innerHTML = `<div class="panel"><a href="#/browse" class="small">← رجوع</a><div class="row" style="align-items:start"><div style="flex:2">
    <h1 style="margin:6px 0">${esc(l.title)}</h1><div>${l.negotiable ? '<span class="tag">قابل للتفاوض</span>' : '<span class="tag g">سعر ثابت</span>'}<span class="tag g">${CAT[l.category][0]} ${CAT[l.category][1]}</span><span class="tag g">${l.deal === 'rent' ? 'إيجار' : 'بيع'}</span>${l.featured ? '<span class="tag f">⭐ مميز</span>' : ''}${l.pro ? '<span class="tag p">✔ سمسار محترف</span>' : ''}</div>
    <p>${esc(l.description) || '<span class="mut">بدون وصف</span>'}</p><p class="small">📍 ${esc(l.city || '—')} · البائع: ${esc(l.seller)}</p></div>
    <div style="flex:1" class="plan"><div class="price">${money(l.price)}${l.deal === 'rent' ? ' / شهر' : ''}</div>
    ${l.phone ? `<p>📞 <a href="tel:${esc(l.phone)}" dir="ltr"><b>${esc(l.phone)}</b></a></p>` : `<p class="small">🔒 <a href="#/login">سجل دخول</a> عشان يظهر رقم التليفون</p>`}
    ${me && !l.mine ? `<button class="btn ghost" id="fav">${l.fav ? '★ في المفضلة' : '☆ أضف للمفضلة'}</button>` : ''}</div></div></div>
    ${l.mine ? `<div class="panel"><h3>إدارة الإعلان</h3><button class="btn" id="sold">تم البيع</button> <button class="btn red" id="del">حذف</button> <a class="btn gold" href="#/promote/${l.id}">⭐ ميّز الإعلان</a>
      <h3>العروض (${l.offers.length})</h3>${l.offers.map(o => `<div class="offer"><b>${money(o.amount)}</b> من ${esc(o.buyer)} · <span dir="ltr">${esc(o.phone)}</span><div class="mut">${esc(o.message)}</div></div>`).join('') || '<p class="mut">لسه مفيش عروض.</p>'}</div>`
    : l.negotiable && l.status === 'active' ? `<div class="panel"><h3>قدّم عرضك</h3><form id="of"><div class="row"><div><label>عرضك (ج.م)</label><input name="amount" type="number" required></div>
      <div><label>رقم تليفونك</label><input name="phone" dir="ltr" value="${esc(me?.phone || '')}"></div></div><label>رسالة</label><textarea name="message" rows="2"></textarea>
      <p class="err" id="e"></p><button class="btn gold">ابعت العرض</button></form></div>` : ''}`;
    const post = (p, d) => api(p, d).then(() => pages.l(id));
    if ($('#fav')) $('#fav').onclick = () => post('fav', { id });
    if ($('#sold')) $('#sold').onclick = () => post('listing/update', { id, action: 'sold' });
    if ($('#del')) $('#del').onclick = () => confirm('متأكد؟') && api('listing/update', { id, action: 'delete' }).then(() => location.hash = '#/mine');
    if ($('#of')) $('#of').onsubmit = async e => { e.preventDefault(); if (need()) return;
      try { await api('offer', { id, ...Object.fromEntries(new FormData(e.target)) }); $('#of').innerHTML = '<p style="color:var(--ok);font-weight:700">✅ تم إرسال عرضك للبائع</p>'; } catch (x) { $('#e').textContent = x.message; } };
  },
  async mine() { if (need()) return; const { listings } = await api('listings?mine=1');
    app.innerHTML = `<h2>إعلاناتي</h2><div class="grid">${listings.map(card).join('') || '<p class="mut">لسه ماضفتش إعلانات.</p>'}</div>`; },
  async favs() { if (need()) return; const { listings } = await api('favs');
    app.innerHTML = `<h2>المفضلة</h2><div class="grid">${listings.map(card).join('') || '<p class="mut">مفيش مفضلة.</p>'}</div>`; },
  async new() { if (need()) return;
    app.innerHTML = `<div class="panel narrow" style="max-width:640px"><h2>أضف إعلان</h2><form id="f"><label>الفئة</label><div class="choice">${Object.entries(CAT).map(([k, v], i) => `<label><input type="radio" name="category" value="${k}" ${i ? '' : 'checked'}><span class="e">${v[0]}</span>${v[1]}</label>`).join('')}</div>
    <div id="dealbox"><label>نوع الصفقة</label><select name="deal"><option value="sale">بيع</option><option value="rent">إيجار</option></select></div>
    <label>العنوان</label><input name="title" required maxlength="120" placeholder="مثال: تويوتا كورولا 2020 فبريكا">
    <label>الوصف</label><textarea name="description" rows="4"></textarea>
    <div class="row"><div><label>السعر (ج.م)</label><input name="price" type="number" required min="1"></div><div><label>المدينة</label><input name="city"></div></div>
    <label>رقم التليفون للتواصل</label><input name="phone" dir="ltr" value="${esc(me.phone)}">
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="negotiable" style="width:auto" checked> السعر قابل للتفاوض</label>
    <p class="err" id="e"></p><button class="btn gold">انشر الإعلان</button></form></div>`;
    const f = $('#f'), sync = () => $('#dealbox').style.display = f.category.value === 'rentals' ? 'none' : ''; f.onchange = sync;
    f.onsubmit = async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(f)); d.negotiable = !!f.negotiable.checked;
      try { const r = await api('listings', d); location.hash = '#/l/' + r.id; } catch (x) { $('#e').textContent = x.message; } };
  },
  async login() {
    app.innerHTML = `<div class="panel narrow"><h2>تسجيل الدخول</h2><form id="f"><label>الايميل</label><input name="email" type="email" required dir="ltr"><label>كلمة السر</label><input name="password" type="password" required>
    <p class="err" id="e"></p><button class="btn">دخول</button> <a href="#/signup" class="small">معنديش حساب</a></form></div>`;
    $('#f').onsubmit = async e => { e.preventDefault(); try { await api('login', Object.fromEntries(new FormData(e.target))); await loadMe(); location.hash = '#/'; } catch (x) { $('#e').textContent = x.message; } };
  },
  async signup() {
    app.innerHTML = `<div class="panel narrow"><h2>حساب جديد</h2><p class="mut">التسجيل مجاني ومفتوح للكل.</p><form id="f"><label>هتستخدم صفقة عشان:</label>
    <div class="choice"><label><input type="radio" name="role" value="sell"><span class="e">💼</span>أبيع</label><label><input type="radio" name="role" value="buy"><span class="e">🛒</span>أشتري</label><label><input type="radio" name="role" value="both" checked><span class="e">🔁</span>الاتنين</label></div>
    <label>الاسم</label><input name="name" required><label>الايميل</label><input name="email" type="email" required dir="ltr"><label>رقم التليفون</label><input name="phone" required dir="ltr" placeholder="01xxxxxxxxx">
    <label>كلمة السر</label><input name="password" type="password" required minlength="6"><p class="err" id="e"></p><button class="btn gold">إنشاء الحساب</button> <a href="#/login" class="small">عندي حساب</a></form></div>`;
    $('#f').onsubmit = async e => { e.preventDefault(); try { const r = await api('signup', Object.fromEntries(new FormData(e.target))); await loadMe(); location.hash = r.user.role === 'buy' ? '#/browse' : '#/new'; } catch (x) { $('#e').textContent = x.message; } };
  },
  async plans() {
    const pay = me ? (await api('payments')) : null;
    app.innerHTML = `<h2>الباقات</h2><div class="tiers"><div class="tier"><b>مجاني</b><div class="big">0 ج.م</div><ul><li>حتى 3 إعلانات نشطة</li><li>تصفح وتفاوض بلا حدود</li></ul></div>
    <div class="tier pro"><b>سمسار محترف ✔</b><div class="big">${me?.pro_price || 200} ج.م / شهر</div><ul><li>إعلانات غير محدودة</li><li>شارة "محترف" على كل إعلاناتك</li></ul>${me ? `<button class="btn gold" id="gopro">اشترك</button>` : '<a class="btn gold" href="#/signup">سجل الأول</a>'}</div>
    <div class="tier"><b>إعلان مميز ⭐</b><div class="big">${me?.feature_price || 50} ج.م / 7 أيام</div><ul><li>يظهر في أول القائمة</li><li>إطار ذهبي وشارة "مميز"</li></ul><p class="small">من صفحة إعلانك اضغط "ميّز الإعلان"</p></div></div>
    <div id="payform"></div>${pay && pay.payments.length ? `<h3>${pay.admin ? 'طلبات دفع تنتظر المراجعة' : 'طلباتي'}</h3><div class="panel">${pay.payments.map(p => `<div class="offer">${p.kind === 'pro' ? 'اشتراك محترف' : 'تمييز: ' + esc(p.title)} · ${money(p.amount)} · مرجع: <span dir="ltr">${esc(p.reference)}</span> · <b>${{ pending: 'قيد المراجعة', approved: 'تم التفعيل', rejected: 'مرفوض' }[p.status]}</b>
      ${pay.admin ? `<br>${esc(p.name)} (${esc(p.email)}) <button class="btn gold" data-a="1" data-id="${p.id}">قبول</button> <button class="btn red" data-id="${p.id}">رفض</button>` : ''}</div>`).join('')}</div>` : ''}`;
    document.querySelectorAll('[data-id]').forEach(b => b.onclick = async () => { await api('admin/payment', { id: +b.dataset.id, approve: !!b.dataset.a }); pages.plans(); });
    if ($('#gopro')) $('#gopro').onclick = () => payForm('pro');
  },
  async promote(id) { if (need()) return; pages.plans().then(() => payForm('feature', id)); },
  async account() { if (need()) return;
    app.innerHTML = `<div class="panel narrow"><h2>حسابي</h2><p><b>${esc(me.name)}</b><br><span class="mut" dir="ltr">${esc(me.email)}</span></p>
    <form id="f"><label>نوع الاستخدام</label><div class="choice">${['sell', 'buy', 'both'].map(r => `<label><input type="radio" name="role" value="${r}" ${me.role === r ? 'checked' : ''}>${ROLE[r]}</label>`).join('')}</div>
    <label>التليفون</label><input name="phone" dir="ltr" value="${esc(me.phone)}"><button class="btn">حفظ</button></form>
    <div class="plan" style="margin-top:18px"><b>الباقة:</b> ${me.pro ? 'محترف ✔' : 'مجاني'} · إعلانات نشطة: ${me.active_listings}${me.pro ? '' : ' / ' + me.free_limit}<br><a href="#/plans">الباقات والدفع</a></div>
    <p><button class="btn ghost" id="out">تسجيل خروج</button></p></div>`;
    $('#f').onsubmit = async e => { e.preventDefault(); await api('me', Object.fromEntries(new FormData(e.target))); await loadMe(); pages.account(); };
    $('#out').onclick = async () => { await api('logout', {}); await loadMe(); location.hash = '#/'; };
  },
};
async function route() {
  const m = /^#\/([^/?]*)\/?([^?]*)/.exec(location.hash || '#/') || [0, '', ''], name = m[1], rest = m[2];
  const qs = (location.hash.split('?')[1]) || '';
  const n = name || 'home';
  try { await (pages[n] || pages.home)((n === 'l' || n === 'promote') ? rest : qs); } catch (e) { app.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  scrollTo(0, 0);
}
addEventListener('hashchange', route);
loadMe().then(route);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
let dip; addEventListener('beforeinstallprompt', e => { e.preventDefault(); dip = e; $('#install').style.display = ''; });
$('#ibtn').onclick = async () => { if (dip) { dip.prompt(); dip = null; $('#install').style.display = 'none'; } };
