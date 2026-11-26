// Seeds demo data into a running Safqa. Usage: node seed-demo.js http://localhost:3000
const base = process.argv[2] || 'http://localhost:3000';
async function call(path, body, cookie) {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookie || '' }, body: JSON.stringify(body) });
  const c = (r.headers.get('set-cookie') || '').split(';')[0];
  return { status: r.status, cookie: c, json: await r.json().catch(() => ({})) };
}
async function user(name, email, phone, role) {
  let r = await call('/api/signup', { name, email, phone, password: 'demo1234', role });
  if (r.status === 409) r = await call('/api/login', { email, password: 'demo1234' });
  return r.cookie;
}
(async () => {
  const seller = await user('أحمد السمسار', 'seller@demo.safqa', '01000000001', 'sell');
  const seller2 = await user('منى للعقارات', 'seller2@demo.safqa', '01000000002', 'sell');
  const buyer = await user('كريم المشتري', 'buyer@demo.safqa', '01000000003', 'buy');
  const L = [
    [seller, 'cars', 'sale', 'هيونداي النترا 2020 فابريكا', 'عداد 45 ألف كم، فل الفل، رخصة سارية، صيانة توكيل.', 650000, 1, 'القاهرة'],
    [seller, 'cars', 'sale', 'كيا سبورتاج 2022', 'حالة الزيرو، أول مالك، تأمين شامل.', 1250000, 1, 'الجيزة'],
    [seller, 'cars', 'sale', 'تويوتا كورولا 2018', 'ماشية 90 ألف، بدون حوادث.', 520000, 0, 'الإسكندرية'],
    [seller2, 'realestate', 'sale', 'شقة 150م في التجمع الخامس', 'الدور الثالث، تشطيب سوبر لوكس، قريبة من الخدمات.', 3200000, 1, 'القاهرة الجديدة'],
    [seller2, 'realestate', 'sale', 'فيلا 300م في الشيخ زايد', 'حديقة خاصة وحمام سباحة، كمبوند راقي.', 9800000, 1, 'الشيخ زايد'],
    [seller2, 'rentals', 'rent', 'شقة للإيجار في مدينة نصر', '3 غرف، مفروشة، إيجار شهري.', 12000, 1, 'مدينة نصر'],
    [seller2, 'rentals', 'rent', 'محل للإيجار في وسط البلد', '40م على شارع رئيسي.', 25000, 0, 'وسط البلد'],
  ];
  const ids = [];
  for (const [c, category, deal, title, description, price, negotiable, city] of L) {
    const r = await call('/api/listings', { category, deal, title, description, price, negotiable, city, phone: '0100000000' }, c);
    ids.push(r.json.id);
  }
  await call('/api/offer', { id: ids[0], amount: 620000, message: 'مهتم، ممكن نتقابل؟' }, buyer);
  await call('/api/fav', { id: ids[1] }, buyer);
  console.log('seeded', ids.filter(Boolean).length, 'listings. Demo logins (password demo1234): seller@demo.safqa, seller2@demo.safqa, buyer@demo.safqa');
})();
