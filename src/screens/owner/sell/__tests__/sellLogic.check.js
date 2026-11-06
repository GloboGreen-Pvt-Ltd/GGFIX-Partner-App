/* eslint-disable no-console */
// Logic checks for the Sell module's pure code (api/sellListings.js and
// sell/draft.js) without a test runner: `node src/screens/owner/sell/__tests__/sellLogic.check.js`
// from the app folder. Native / network modules are stubbed; the HTTP stub
// records calls so the legacy-fallback paths can be asserted.

const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const assert = require('assert');

const root = path.resolve(__dirname, '../../../../..');
const calls = [];
let responder = () => { throw Object.assign(new Error('not stubbed'), { status: 500 }); };

const stubs = {
  './client': {
    marketplaceApi: Object.fromEntries(['get', 'post', 'put', 'patch', 'del'].map((m) => [m, async (p, opts) => {
      calls.push({ m, p, opts });
      return responder(m, p, opts);
    }])),
  },
  '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => {} } },
  react: { useEffect: () => {}, useState: (v) => [v, () => {}] },
};

function load(rel) {
  const file = path.join(root, rel);
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'], filename: file, babelrc: false, configFile: false });
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  const origRequire = m.require.bind(m);
  m.require = (id) => {
    if (stubs[id]) return stubs[id];
    if (id === '../../../api/sellListings') return load('src/api/sellListings.js');
    return origRequire(id);
  };
  m._compile(code, file);
  return m.exports;
}

const api = load('src/api/sellListings.js');
const draftMod = load('src/screens/owner/sell/draft.js');

const results = [];
async function test(name, fn) {
  try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, e.message]); }
}

const UUID = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';

(async () => {
  await test('toProductRequest drops placeholder ids and mirrors sellMeta', () => {
    const body = api.toProductRequest({ title: 'X', ramOptionId: 'ram:6 GB', storageOptionId: UUID, quantity: 3, negotiable: true, images: ['a', 'b', 'c'], fulfilmentOptions: ['SHIPPING'] });
    assert.strictEqual(body.ramOptionId, null);
    assert.strictEqual(body.storageOptionId, UUID);
    assert.strictEqual(body.imageUrl, 'a');
    assert.deepStrictEqual(body.extraImageUrls, ['b', 'c']);
    const meta = JSON.parse(body.assessmentJson).sellMeta;
    assert.strictEqual(meta.quantity, 3);
    assert.strictEqual(meta.negotiable, true);
    assert.deepStrictEqual(meta.fulfilmentOptions, ['SHIPPING']);
  });

  await test('toProductRequest caps photos at 10', () => {
    const body = api.toProductRequest({ images: Array.from({ length: 14 }, (_, i) => `u${i}`) });
    assert.strictEqual(1 + body.extraImageUrls.length, 10);
  });

  await test('normalizeProduct maps legacy statuses and reads sellMeta', () => {
    const p = api.normalizeProduct({ id: '1', status: 'COMPLETED', assessmentJson: JSON.stringify({ sellMeta: { quantity: 4, negotiable: true } }), imageUrl: 'a', extraImageUrls: ['b'] });
    assert.strictEqual(p._status, 'SOLD');
    assert.strictEqual(p.quantity, 4);
    assert.strictEqual(p.negotiable, true);
    assert.deepStrictEqual(p.images, ['a', 'b']);
    assert.strictEqual(api.normalizeProduct({ status: 'CANCELLED' })._status, 'INACTIVE');
  });

  await test('canTransition follows the contract', () => {
    assert.ok(api.canTransition('DRAFT', 'ACTIVE'));
    assert.ok(api.canTransition('ACTIVE', 'SOLD'));
    assert.ok(api.canTransition('INACTIVE', 'ACTIVE'));
    assert.ok(!api.canTransition('SOLD', 'ACTIVE'));
    assert.ok(!api.canTransition('DRAFT', 'SOLD'));
  });

  await test('legacy server: list falls back, filters by shop, counts statuses', async () => {
    api.resetSellServerMode();
    calls.length = 0;
    responder = (m, p, opts) => {
      if (p === '/shop/marketplace/summary') throw Object.assign(new Error('nf'), { status: 404 });
      const st = opts?.query?.status;
      if (st === 'ACTIVE') return [{ id: 'a', shopId: 'S1', status: 'ACTIVE', title: 'iPhone 13' }, { id: 'x', shopId: 'S2', status: 'ACTIVE' }];
      if (st === 'COMPLETED') return [{ id: 'b', shopId: 'S1', status: 'COMPLETED', title: 'Pixel' }];
      if (st === 'DRAFT') return [{ id: 'c', shopId: 'S1', status: 'DRAFT', title: 'Galaxy' }];
      return [];
    };
    const res = await api.listMyListings({ status: 'ALL' }, { shopId: 'S1' });
    assert.strictEqual(res.legacy, true);
    assert.deepStrictEqual(res.counts, { ALL: 3, ACTIVE: 1, DRAFT: 1, SOLD: 1, INACTIVE: 0 });
    const sold = await api.listMyListings({ status: 'SOLD' }, { shopId: 'S1' });
    assert.deepStrictEqual(sold.content.map((p) => p.id), ['b']);
    const q = await api.listMyListings({ status: 'ALL', q: 'pix' }, { shopId: 'S1' });
    assert.deepStrictEqual(q.content.map((p) => p.id), ['b']);
  });

  await test('legacy server: enquiries throw SERVER_UPDATE_REQUIRED', async () => {
    await assert.rejects(api.listEnquiries({}), (e) => e.code === 'SERVER_UPDATE_REQUIRED');
  });

  await test('legacy server: partial sale keeps the listing and lowers quantity', async () => {
    calls.length = 0;
    responder = (m, p, opts) => ({ id: 'a', status: 'ACTIVE', assessmentJson: opts.body.assessmentJson });
    const prod = api.normalizeProduct({ id: 'a', status: 'ACTIVE', assessmentJson: JSON.stringify({ sellMeta: { quantity: 5 } }) });
    const out = await api.setListingStatus(prod, 'SOLD', { quantitySold: 2 });
    assert.strictEqual(calls[0].m, 'put');
    assert.strictEqual(out.quantity, 3);
    assert.strictEqual(out.soldQuantity, 2);
    assert.strictEqual(out._status, 'ACTIVE');
  });

  await test('invalid status change is refused before any request', async () => {
    calls.length = 0;
    await assert.rejects(api.setListingStatus({ id: 'a', status: 'SOLD' }, 'ACTIVE'), (e) => e.status === 409);
    assert.strictEqual(calls.length, 0);
  });

  await test('old server answering 500 "No static resource" counts as legacy', async () => {
    api.resetSellServerMode();
    responder = (m, p, opts) => {
      if (p === '/shop/marketplace/summary') {
        throw Object.assign(new Error('Server error. Please try again.'), { status: 500, devMessage: 'No static resource shop/marketplace/summary.' });
      }
      return opts?.query?.status === 'ACTIVE' ? [{ id: 'a', shopId: 'S1', status: 'ACTIVE' }] : [];
    };
    const s = await api.getSellSummary({ shopId: 'S1' });
    assert.strictEqual(s.legacy, true);
    assert.strictEqual(s.active, 1);
  });

  await test('a real server outage is not mistaken for an old server', async () => {
    api.resetSellServerMode();
    responder = () => { throw Object.assign(new Error('Server error. Please try again.'), { status: 500, devMessage: 'Connection refused' }); };
    await assert.rejects(api.getSellSummary({ shopId: 'S1' }), (e) => e.status === 500);
  });

  await test('v2 server: create posts to the shop endpoint with clientRef', async () => {
    api.resetSellServerMode();
    calls.length = 0;
    responder = (m, p, opts) => (p === '/shop/marketplace/summary' ? { active: 0 } : { id: 'n1', status: 'ACTIVE', ...opts?.body });
    await api.createListing({ title: 'T', clientRef: 'ref-1', images: ['a', 'b', 'c'] }, { shopId: 'S1' });
    const post = calls.find((c) => c.m === 'post');
    assert.strictEqual(post.p, '/shop/marketplace/products');
    assert.strictEqual(post.opts.body.clientRef, 'ref-1');
    assert.strictEqual(post.opts.body.shopId, undefined);
  });

  await test('draftToFields builds a publishable device payload, cover photo first', () => {
    const d = draftMod.emptyListingDraft('DEVICE');
    d.product = { ...d.product, modelName: 'iPhone 15 Pro', ramLabel: '8 GB', storageLabel: '256 GB', itemCondition: 'USED', modelId: UUID };
    d.condition = { ...d.condition, working: 'WORKING', description: 'Excellent condition, battery 98%.', issues: ['Face ID'] };
    d.media = { photos: [{ key: 'p1', url: 'u1', status: 'done' }, { key: 'p2', url: 'u2', status: 'done' }, { key: 'p3', url: 'u3', status: 'error' }], coverKey: 'p2', video: null };
    d.pricing = { ...d.pricing, price: '82000', quantity: 1 };
    const f = draftMod.draftToFields(d);
    assert.strictEqual(f.title, 'iPhone 15 Pro (8 GB / 256 GB)');
    assert.deepStrictEqual(f.images, ['u2', 'u1']);
    assert.strictEqual(f.price, 82000);
    assert.strictEqual(f.status, 'ACTIVE');
    assert.strictEqual(f.conditionLabel, 'Used · Working');
    assert.ok(f.description.includes('Defects: Face ID'));
  });

  await test('draftFromProduct round-trips a stored listing', () => {
    const d = draftMod.emptyListingDraft('DEVICE');
    d.product = { ...d.product, modelName: 'Pixel 8', categoryName: 'Mobile', storageLabel: '128 GB', itemCondition: 'REFURBISHED' };
    d.condition = { ...d.condition, working: 'WORKING', description: 'Clean unit, no issues at all.', accessories: ['Original Box'], accessoriesOther: 'Case' };
    d.media = { photos: [{ key: 'a', url: 'u1', status: 'done' }], coverKey: 'a', video: null };
    d.pricing = { ...d.pricing, price: '30000', quantity: 2, negotiable: true, fulfilment: ['PICKUP', 'SHIPPING'] };
    const f = draftMod.draftToFields(d);
    const stored = api.normalizeProduct({ id: 'id1', status: 'ACTIVE', ...api.toProductRequest(f) });
    const back = draftMod.draftFromProduct(stored);
    assert.strictEqual(back.editingId, 'id1');
    assert.strictEqual(back.product.modelName, 'Pixel 8');
    assert.strictEqual(back.product.itemCondition, 'REFURBISHED');
    assert.strictEqual(back.condition.description, 'Clean unit, no issues at all.');
    assert.deepStrictEqual(back.condition.accessories, ['Original Box']);
    assert.strictEqual(back.condition.accessoriesOther, 'Case');
    assert.strictEqual(back.pricing.quantity, 2);
    assert.strictEqual(back.pricing.negotiable, true);
    assert.deepStrictEqual(back.pricing.fulfilment, ['PICKUP', 'SHIPPING']);
    assert.strictEqual(back.media.photos[0].url, 'u1');
  });

  results.forEach((r) => console.log(r.join(' | ')));
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();

