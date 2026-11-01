const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const code = fs.readFileSync('dist/content.js', 'utf8');
const item = { id: 8399110754, title: 'Утепленная Мембранная Куртка Krakatau оригинал', isReserved: true };
const state = JSON.stringify({ loaderData: { data: { catalog: { items: [item] } } } });
const card = (attr = 'data-item-id="8399110754"', label = '') => `<div data-marker="item" ${attr}><a data-marker="item-title" href="/moskva/test_8399110754?context=test">${item.title}</a>${label}</div>`;
function open(t, html) {
  const dom = new JSDOM(html, { url: 'https://www.avito.ru/all?q=krakatau', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  dom.window.eval(code);
  return dom.window;
}
const wait = () => new Promise(resolve => setTimeout(resolve, 230));
const marked = w => !!w.document.querySelector('[data-marker="item"].arm-reserved');
test('ID from actual Avito product link without data-item-id', t => {
  const w = open(t, `<script type="application/json">${state}</script>${card('')}`);
  assert.ok(marked(w));
});
test('JSON inside a JavaScript string with escaped apostrophe/backslash', t => {
  const json = JSON.stringify({items:[{...item, description:"It's a coat \\ text"}]});
  const literal = "'" + json.replaceAll('\\', '\\\\').replaceAll("'", "\\'") + "'";
  const w = open(t, `<script>window.__staticRouterHydrationData=JSON.parse(${literal});</script>${card()}`);
  assert.ok(marked(w));
});
test('marker restored after hover rerender overwrites class and removes badge', async t => {
  const w = open(t, `<script type="application/json">${state}</script>${card()}`);
  const el = w.document.querySelector('[data-marker="item"]');
  el.className = 'hover-card';
  await wait();
  assert.ok(marked(w), 'class-only hover rerender');
  el.querySelector('.arm-badge').remove();
  await wait();
  assert.ok(el.querySelector('.arm-badge'));
});
test('URL change does not lose status from retained script', async t => {
  const w = open(t, `<script type="application/json">${state}</script>${card()}`);
  w.history.pushState({}, '', '?q=krakatau&p=2');
  w.document.body.append(w.document.createElement('div'));
  await wait();
  assert.ok(marked(w));
});
test('native reservation text disappearing on hover retains known status', async t => {
  const w = open(t, card('', '<span id="native">Забронировано</span>'));
  assert.ok(marked(w));
  w.document.getElementById('native').remove();
  await wait();
  assert.ok(marked(w));
});
test('updated false status removes marker and badge', async t => {
  const w = open(t, `<script type="application/json">${state}</script>${card()}`);
  w.document.querySelector('script').textContent = JSON.stringify({items:[{...item,isReserved:false}]});
  await wait();
  assert.equal(marked(w), false);
  assert.equal(w.document.querySelector('.arm-badge'), null);
});
test('unreserved card stays untouched', t => {
  const w = open(t, `<script type="application/json">${JSON.stringify({items:[{...item,isReserved:false}]})}</script>${card()}`);
  assert.equal(marked(w), false);
});

test('reservation uses a separate overlay restored after gallery rerender', async t => {
  const w = open(t, `<script type="application/json">${state}</script>${card()}`);
  const el = w.document.querySelector('[data-marker="item"]');
  const frame = el.querySelector(':scope > .arm-frame');
  assert.ok(frame, 'frame must be separate from the card outline');
  assert.equal(frame.getAttribute('aria-hidden'), 'true');
  frame.remove();
  await wait();
  assert.ok(el.querySelector(':scope > .arm-frame'));
  w.document.querySelector('script').textContent = JSON.stringify({items:[{...item,isReserved:false}]});
  await wait();
  assert.equal(el.querySelector('.arm-frame'), null);
});

test('home page: mark reserved recommendation cards from real saved HTML', t => {
  const html = fs.readFileSync('avito_mocks/home_page.html', 'utf8');
  const w = open(t, html);
  const cards = [...w.document.querySelectorAll('[data-marker="bx-recommendations-block-item"]')];
  const reserved = cards.filter(card => [...card.querySelectorAll('span')].some(el =>
    !el.closest('.arm-badge') && el.textContent.trim() === 'Забронировано'));
  assert.ok(reserved.length > 0, 'fixture must include reserved cards');
  for (const card of cards) {
    assert.equal(card.hasAttribute('data-arm-reserved'), reserved.includes(card));
  }
});

test('home page: status from JSON and title link, including hover text removal', async t => {
  const w = open(t, `<script type="application/json">${state}</script><div data-marker="bx-recommendations-block-item"><a data-marker="title" itemprop="url" href="/murino/test_8399110754">Test</a></div>`);
  const card = w.document.querySelector('[data-marker="bx-recommendations-block-item"]');
  assert.ok(card.hasAttribute('data-arm-reserved'));
  card.className = 'hover';
  await wait();
  assert.ok(card.querySelector('.arm-frame'));
});

test('home page: fetch detail status for visible card with no reservation data', async t => {
  const html = fs.readFileSync('avito_mocks/home_page_with_reserved.html', 'utf8');
  const detail = fs.readFileSync('avito_mocks/product_detailed_reserved.html', 'utf8');
  const dom = new JSDOM(html, { url: 'https://www.avito.ru/', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  let callback;
  w.IntersectionObserver = class { constructor(cb, options) { callback = cb; assert.equal(options?.rootMargin, "1000px 0px"); } observe() {} unobserve() {} };
  const requests = [];
  w.fetch = async url => {requests.push(url); return {ok:true, url, text:async()=>detail};};
  w.eval(code);
  const link = w.document.querySelector('a[href*="_8483067201"]');
  const el = link.closest('[data-marker="bx-recommendations-block-item"]');
  assert.ok(callback, 'visible recommendations must be observed');
  assert.equal(requests.length, 0, 'offscreen cards must not be fetched');
  callback([{target:el,isIntersecting:true}]);
  await wait();
  assert.equal(requests.length, 1);
  for (let i = 0; i < 15 && !el.hasAttribute('data-arm-reserved'); i++) await wait();
  assert.ok(el.hasAttribute('data-arm-reserved'));
  assert.ok(el.querySelector('.arm-frame'));
  callback([{target:el,isIntersecting:true}]);
  await wait();
  assert.equal(requests.length, 1, 'reuse result instead of requesting again');
});


test('home detail: an explicit false or verification page must never add a marker', async t => {
  for (const detail of ['<script type="application/json">{"deliveryInfo":{"isReserved":false}}</script>', '<html><body>Проверка доступа</body></html>']) {
    const dom = new JSDOM('<div data-marker="bx-recommendations-block-item"><a itemprop="url" href="/test_8483067201">Test</a></div>', {url:'https://www.avito.ru/',runScripts:'outside-only'});
    t.after(() => dom.window.close());
    const w=dom.window;
    let callback;
    w.IntersectionObserver=class {constructor(cb){callback=cb;} observe(){} unobserve(){}};
    w.fetch=async url=>({ok:true,url,text:async()=>detail});
    w.eval(code);
    const el=w.document.querySelector('[data-marker="bx-recommendations-block-item"]');
    callback([{target:el,isIntersecting:true}]);
    await wait();
    assert.equal(el.hasAttribute('data-arm-reserved'),false);
  }
});

test('catalog badge lives in sellerInfo and returns after that block is rerendered', async t => {
  const html = card().replace('</div>', '<div class="asideContent-test"><div class="sellerInfo-test">Продавец</div></div></div>');
  const w = open(t, `<script type="application/json">${state}</script>${html}`);
  const seller = w.document.querySelector('.sellerInfo-test');
  assert.equal(w.document.querySelector('.arm-badge')?.parentElement, seller);
  seller.replaceChildren(w.document.createTextNode('Продавец после обновления'));
  await wait();
  assert.equal(seller.querySelectorAll('.arm-badge').length, 1);
});

test('catalog badge uses asideContent when sellerInfo is absent', t => {
  const html = card().replace('</div>', '<div class="asideContent-test"></div></div>');
  const w = open(t, `<script type="application/json">${state}</script>${html}`);
  assert.equal(w.document.querySelector('.arm-badge')?.parentElement, w.document.querySelector('.asideContent-test'));
});

test('homepage badge stays at bottom of card even when sellerInfo is present', t => {
  const w = open(t, `<script type="application/json">${state}</script><div data-marker="bx-recommendations-block-item"><a data-marker="title" href="/test_8399110754">Test</a><div class="sellerInfo-test">Продавец</div></div>`);
  const el = w.document.querySelector('[data-marker="bx-recommendations-block-item"]');
  assert.equal(el.lastElementChild?.className, 'arm-badge');
});

