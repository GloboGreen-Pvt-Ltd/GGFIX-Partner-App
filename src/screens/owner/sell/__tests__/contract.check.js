/* eslint-disable no-console */
// Contract check: the app's real API layer (api/sellListings.js + sell/draft.js)
// against a running marketplace-service. Only for a local or staging service
// (it creates rows and mints tokens with the service's JWT secret):
//
//   BASE=http://localhost:18087 JWT_SECRET=... SHOP_A=... OWNER_A=... node src/screens/owner/sell/__tests__/contract.check.js

const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const babel = require('@babel/core');
const assert = require('assert');

const { BASE, JWT_SECRET, SHOP_A, OWNER_A } = process.env;
if (!BASE || !JWT_SECRET || !SHOP_A || !OWNER_A) {
  console.error('Set BASE, JWT_SECRET, SHOP_A, OWNER_A');
  process.exit(2);
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(sub, claims) {
  const unsigned = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}`;
  return `${unsigned}.${crypto.createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url')}`;
}
const ownerToken = token(OWNER_A, { shopId: SHOP_A, roles: ['SHOP_OWNER'], loginScope: 'OWNER' });
const buyerToken = token(crypto.randomUUID(), { roles: ['CUSTOMER'] });

// Same surface as src/api/client.js createClient(): get/post/put/patch/del(path, { query, body }).
function client(auth) {
  const call = async (method, p, { query, body } = {}) => {
    const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null)).toString()}` : '';
    const res = await fetch(BASE + p + qs, {
      method,
      headers: { Authorization: `Bearer ${auth}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw Object.assign(new Error(json?.message || `HTTP ${res.status}`), { status: res.status });
    return json;
  };
  return { get: (p, o) => call('GET', p, o), post: (p, o) => call('POST', p, o), put: (p, o) => call('PUT', p, o), patch: (p, o) => call('PATCH', p, o), del: (p, o) => call('DELETE', p, o) };
}

const root = path.resolve(__dirname, '../../../../..');
const stubs = {
  './client': { marketplaceApi: client(ownerToken) },
  '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => {} } },
  react: { useEffect: () => {}, useState: (v) => [v, () => {}] },
};
const cache = {};
function load(rel) {
  if (cache[rel]) return cache[rel];
  const file = path.join(root, rel);
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'], filename: file, babelrc: false, configFile: false });
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  const req = m.require.bind(m);
  m.require = (id) => stubs[id] || (id === '../../../api/sellListings' ? load('src/api/sellListings.js') : req(id));
  m._compile(code, file);
  cache[rel] = m.exports;
  return m.exports;
}
const api = load('src/api/sellListings.js');
const D = load('src/screens/owner/sell/draft.js');
const buyer = client(buyerToken);

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(`PASS | ${name}`); } catch (e) { results.push(`FAIL | ${name} | ${e.message}`); }
}

(async () => {
  const ctx = { shopId: SHOP_A, userId: OWNER_A };
  const tag = Date.now().toString(36);
  let listing;
  let summary0;

  await step('summary via v2 (server mode detected)', async () => {
    summary0 = await api.getSellSummary(ctx);
    assert.strictEqual(summary0.legacy, false);
    assert.ok(Number.isInteger(summary0.active));
  });

  await step('wizard draft → createListing → server accepts and round-trips', async () => {
    const d = D.emptyListingDraft('DEVICE');
    d.product = { ...d.product, modelName: `Pixel 8 ${tag}`, ramLabel: '8 GB', storageLabel: '128 GB', ramOptionId: 'ram:8 GB', itemCondition: 'USED', color: 'Obsidian' };
    d.condition = { ...d.condition, working: 'WORKING', description: 'Clean unit, battery 91%, no repairs.', accessories: ['Original Box'] };
    d.media = { photos: ['1', '2', '3'].map((n) => ({ key: n, url: `https://cdn.neargfix.com/t/${n}.jpg`, status: 'done' })), coverKey: '2', video: null };
    d.pricing = { ...d.pricing, price: '41000', quantity: 2, negotiable: true, fulfilment: ['PICKUP', 'SHIPPING'] };
    listing = await api.createListing(D.draftToFields(d), ctx);
    assert.strictEqual(listing._status, 'ACTIVE');
    assert.strictEqual(listing.quantity, 2);
    assert.strictEqual(listing.negotiable, true);
    assert.deepStrictEqual(listing.fulfilmentOptions, ['PICKUP', 'SHIPPING']);
    assert.strictEqual(listing.images[0], 'https://cdn.neargfix.com/t/2.jpg');
    assert.strictEqual(listing.images.length, 3);
    const back = D.draftFromProduct(await api.getMyListing(listing.id));
    assert.strictEqual(back.product.itemCondition, 'USED');
    assert.strictEqual(back.pricing.price, '41000');
    assert.strictEqual(back.condition.description, 'Clean unit, battery 91%, no repairs.');
    // Same clientRef again (a retried submit) must not create a second row.
    const again = await api.createListing(D.draftToFields(d), ctx);
    assert.strictEqual(again.id, listing.id);
  });

  await step('device with too few photos is refused with a readable 400', async () => {
    const d = D.emptyListingDraft('DEVICE');
    d.product.modelName = `Few photos ${tag}`;
    d.pricing.price = '100';
    await assert.rejects(api.createListing(D.draftToFields(d), ctx), (e) => e.status === 400 && /photo|image/i.test(e.message));
  });

  await step('draft save then edit to publish', async () => {
    const d = D.emptyListingDraft('ACCESSORY');
    d.product = { ...d.product, accessoryName: `Charger ${tag}`, accessoryType: 'Charger / Adapter', itemCondition: 'NEW' };
    d.condition.description = 'Sealed 20W charger.';
    d.pricing = { ...d.pricing, publishMode: 'DRAFT' };
    const draft = await api.createListing(D.draftToFields(d), ctx);
    assert.strictEqual(draft._status, 'DRAFT');
    const ed = D.draftFromProduct(draft);
    ed.media = { photos: [{ key: 'a', url: 'https://cdn.neargfix.com/t/a.jpg', status: 'done' }], coverKey: 'a', video: null };
    ed.pricing = { ...ed.pricing, price: '900', publishMode: 'PUBLISH' };
    const live = await api.updateListing(draft.id, D.draftToFields(ed));
    assert.strictEqual(live._status, 'ACTIVE');
    assert.strictEqual(Number(live.price), 900);
  });

  await step('My Listings: list, search, counts, price, partial sale', async () => {
    const res = await api.listMyListings({ status: 'ACTIVE', q: tag, page: 0, size: 20 }, ctx);
    assert.ok(res.content.some((p) => p.id === listing.id));
    assert.ok(res.counts && Number.isInteger(res.counts.ACTIVE));
    const priced = await api.updateListingPrice(listing, 40000);
    assert.strictEqual(Number(priced.price), 40000);
    const part = await api.setListingStatus(priced, 'SOLD', { quantitySold: 1 });
    assert.strictEqual(part._status, 'ACTIVE');
    assert.strictEqual(part.quantity, 1);
    listing = part;
  });

  await step('Enquiry flow through the app API: quote, counter, accept, confirm', async () => {
    const e = await buyer.post(`/customer/marketplace/products/${listing.id}/enquiries`, { body: { kind: 'PURCHASE_REQUEST', offerAmount: 38000 } });
    const page = await api.listEnquiries({ status: 'ACTIVE', kind: 'PURCHASE_REQUEST' });
    assert.ok(page.content.some((x) => x.id === e.id));
    const q = await api.sendEnquiryOffer(e.id, { amount: 39500, note: 'Lowest' });
    assert.strictEqual(q.status, 'QUOTED');
    await buyer.post(`/customer/marketplace/enquiries/${e.id}/offers`, { body: { amount: 39000 } });
    const det = await api.getEnquiry(e.id);
    assert.ok(det.allowedActions.includes('ACCEPT'));
    const acc = await api.acceptEnquiry(e.id);
    assert.strictEqual(acc.status, 'ACCEPTED');
    assert.ok(acc.allowedActions.includes('CONFIRM'));
    const conf = await api.confirmEnquiry(e.id, 'PICKUP');
    assert.strictEqual(conf.status, 'CONFIRMED');
    const p = await api.getMyListing(listing.id);
    assert.strictEqual(p._status, 'SOLD');
  });

  await step('Reject path', async () => {
    const d = D.emptyListingDraft('ACCESSORY');
    d.product = { ...d.product, accessoryName: `Case ${tag}`, itemCondition: 'NEW' };
    d.condition.description = 'Clear case.';
    d.media = { photos: [{ key: 'a', url: 'https://cdn.neargfix.com/t/a.jpg', status: 'done' }], coverKey: 'a', video: null };
    d.pricing.price = '300';
    const p = await api.createListing(D.draftToFields(d), ctx);
    const e = await buyer.post(`/customer/marketplace/products/${p.id}/enquiries`, { body: { kind: 'ENQUIRY', message: 'Colour?' } });
    const r = await api.rejectEnquiry(e.id, 'Out of stock');
    assert.strictEqual(r.status, 'REJECTED');
    const hist = await api.listEnquiries({ status: 'HISTORY' });
    assert.ok(hist.content.some((x) => x.id === e.id));
  });

  await step('Bulk via app API: partial failure, retry without duplicates', async () => {
    const batchId = crypto.randomUUID();
    const items = [
      { clientRef: `c1-${tag}`, title: `Bulk ok ${tag}`, listingType: 'SPARE_PART', price: 1200, quantity: 4, images: ['https://cdn.neargfix.com/t/p.jpg'], status: 'ACTIVE' },
      { clientRef: `c2-${tag}`, title: `Bulk no photo ${tag}`, listingType: 'DEVICE', price: 5000, status: 'DRAFT' },
      { clientRef: `c3-${tag}`, title: '', listingType: 'ACCESSORY', price: 10 },
    ];
    const r1 = await api.bulkCreateListings({ batchId, publish: true, items }, ctx);
    assert.strictEqual(r1.failed, 1);
    assert.strictEqual(r1.created, 2);
    const r2 = await api.bulkCreateListings({ batchId, publish: true, items }, ctx);
    assert.strictEqual(r2.created, 0);
    assert.strictEqual(r2.existing, 2);
  });

  await step('Delete + summary reflects changes', async () => {
    const d = D.emptyListingDraft('ACCESSORY');
    d.product = { ...d.product, accessoryName: `Temp ${tag}`, itemCondition: 'NEW' };
    d.condition.description = 'To be deleted.';
    d.pricing = { ...d.pricing, publishMode: 'DRAFT' };
    const p = await api.createListing(D.draftToFields(d), ctx);
    await api.deleteListing(p.id);
    await assert.rejects(api.getMyListing(p.id), (e) => e.status === 404);
    const s = await api.getSellSummary(ctx);
    assert.strictEqual(s.sold, summary0.sold + 1);
  });

  results.forEach((r) => console.log(r));
  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
