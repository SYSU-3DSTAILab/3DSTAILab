const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const pages = fs.readdirSync(root).filter(file => file.endsWith('.html'));
const api = 'https://api.web3forms.com/submit';
let server, browser, origin;

before(async () => {
  server = http.createServer((request, response) => {
    const file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml' };
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {})
  });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function openPage(t, file = 'index.html', options = {}) {
  const context = await browser.newContext();
  t.after(() => context.close());
  // 全部外部请求都被拦截；测试绝不会发送真实留言或申请。
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin + '/')) return route.continue();
    if (url.includes('swiper-bundle.min.js')) {
      return route.fulfill({ contentType: 'text/javascript', body: `window.swiperInstances = []; window.Swiper = class {
        constructor(element, options) { window.swiperInstances.push({element, options}); }
      };` });
    }
    if (url.includes('wordcloud2.js') && options.throwWordCloud) {
      return route.fulfill({ contentType: 'text/javascript', body: 'window.WordCloud = () => { throw new Error("Chart failed"); };' });
    }
    if (route.request().resourceType() === 'stylesheet') {
      return route.fulfill({ contentType: 'text/css', body: '.hidden { display: none !important; }' });
    }
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/' + file, { waitUntil: 'load' });
  if (!['nav.html', 'footer.html'].includes(file)) {
    await page.waitForSelector('.navbar', { state: 'attached' });
  }
  return { page, errors };
}

async function fillContact(page) {
  await page.locator('#contact-form [name="name"]').fill('测试用户');
  await page.locator('#contact-form [name="email"]').fill('test@example.com');
  await page.locator('#contact-form [name="message"]').fill('本地自动测试，不发送真实邮件。');
}

async function submit(page, id = 'contact-form') {
  await page.evaluate(id => document.getElementById(id).requestSubmit(), id);
}

async function visibleMessage(page, id) {
  await page.waitForFunction(id => !document.getElementById(id).classList.contains('hidden'), id);
  return page.locator('#' + id).textContent();
}

test('all shipped classic and inline scripts parse', () => {
  for (const file of fs.readdirSync(path.join(root, 'js')).filter(file => file.endsWith('.js'))) {
    new vm.Script(fs.readFileSync(path.join(root, 'js', file), 'utf8'), { filename: file });
  }
  for (const file of pages) {
    const html = fs.readFileSync(path.join(root, file), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (!/\bsrc\s*=/.test(script[1])) new vm.Script(script[2], { filename: file });
    }
  }
});

test('local assets, fragment targets and new-window protections are valid', () => {
  for (const file of pages) {
    const html = fs.readFileSync(path.join(root, file), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `Duplicate IDs in ${file}`);
    for (const match of html.matchAll(/<(?:img|script|link|a)\b[^>]*?\b(?:src|href)="([^"]*)"/g)) {
      const url = match[1];
      if (/^(https?:|\/\/|mailto:|tel:|data:)/i.test(url)) continue;
      if (url.startsWith('#')) {
        assert.ok(url.length > 1 && ids.includes(url.slice(1)), `${file}: invalid fragment ${url}`);
      } else {
        assert.ok(url, `${file}: empty URL`);
        const target = path.join(root, decodeURIComponent(url.split(/[?#]/)[0]));
        assert.ok(fs.existsSync(target), `${file}: missing ${url}`);
        assert.ok(fs.readdirSync(path.dirname(target)).includes(path.basename(target)), `${file}: wrong case in ${url}`);
      }
    }
    for (const match of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
      assert.match(match[0], /rel="[^"]*\bnoopener\b/, `${file}: opener exposed`);
    }
  }
});

test('all complete pages initialize when external scripts are unavailable', async t => {
  for (const file of pages.filter(file => !['nav.html', 'footer.html'].includes(file))) {
    await t.test(file, async t => {
      const { page, errors } = await openPage(t, file);
      await page.waitForSelector('footer', { state: 'attached' });
      assert.deepEqual(errors, []);
      assert.equal(await page.locator('.navbar').count(), 1);
      assert.equal(await page.locator('footer').count(), 1);
    });
  }
});

test('contact sends one POST without the word-cloud library and resets only on confirmed success', async t => {
  const { page } = await openPage(t);
  await fillContact(page);
  let requests = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(api, async route => {
    requests++;
    assert.equal(route.request().method(), 'POST');
    assert.ok(route.request().postData().includes('test@example.com'));
    await gate;
    await route.fulfill({ json: { success: true } });
  });
  await submit(page);
  await page.waitForFunction(() => document.getElementById('submit-btn').disabled);
  await submit(page);
  release();
  await visibleMessage(page, 'thank-you');
  assert.equal(requests, 1);
  assert.equal(await page.locator('#contact-form [name="name"]').inputValue(), '');
  assert.equal(await page.locator('#submit-btn').isDisabled(), false);
  assert.equal(await page.locator('#contact-form').getAttribute('method'), 'POST');
  assert.equal(await page.locator('#contact-form').getAttribute('action'), api);
});

test('a throwing word cloud does not prevent contact submission', async t => {
  const { page, errors } = await openPage(t, 'index.html', { throwWordCloud: true });
  await page.route(api, route => route.fulfill({ json: { success: true } }));
  await fillContact(page);
  await submit(page);
  await visibleMessage(page, 'thank-you');
  assert.deepEqual(errors, []);
});

for (const status of [200, 400]) {
  test(`API error HTML is inert and HTTP ${status} with success:false does not reset input`, async t => {
    const { page } = await openPage(t);
    const payload = '<img src=x onerror="window.__xss=1">';
    await page.route(api, route => route.fulfill({ status, json: { success: false, message: payload } }));
    await fillContact(page);
    await submit(page);
    assert.equal(await visibleMessage(page, 'form-error'), payload);
    assert.equal(await page.locator('#form-error img').count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await page.locator('#contact-form [name="name"]').inputValue(), '测试用户');
    assert.equal(await page.locator('#thank-you').evaluate(el => el.classList.contains('hidden')), true);
    assert.equal(await page.locator('#submit-btn').isDisabled(), false);
  });
}

for (const mode of ['invalid JSON', 'network failure', 'timeout']) {
  test(`contact recovers from ${mode} and preserves input`, async t => {
    const { page } = await openPage(t);
    if (mode === 'timeout') await page.clock.install();
    await page.route(api, route => {
      if (mode === 'invalid JSON') return route.fulfill({ status: 502, contentType: 'text/html', body: '<h1>Bad Gateway</h1>' });
      if (mode === 'network failure') return route.abort();
      // 保持请求未完成，由页面自己的超时逻辑取消。
    });
    await fillContact(page);
    await submit(page);
    if (mode === 'timeout') await page.clock.fastForward(15001);
    assert.ok(await visibleMessage(page, 'form-error'));
    assert.equal(await page.locator('#contact-form [name="name"]').inputValue(), '测试用户');
    assert.equal(await page.locator('#submit-btn').isDisabled(), false);
  });
}

test('invalid fields and honeypot submissions do not reach the API', async t => {
  const { page } = await openPage(t);
  let requests = 0;
  await page.route(api, route => { requests++; return route.fulfill({ json: { success: true } }); });
  await submit(page);
  await fillContact(page);
  await page.locator('#contact-form [name="botcheck"]').evaluate(el => { el.checked = true; });
  await submit(page);
  assert.equal(requests, 0);
  assert.equal(await page.locator('#submit-btn').isDisabled(), false);
});

test('dataset application sends the selected GBA-UBF name and cannot switch during submission', async t => {
  const { page } = await openPage(t, 'statistic.html');
  await page.locator('button[onclick*="GBA-UBF"]').click();
  assert.equal(await page.locator('#modal_dataset_input').inputValue(), 'GBA-UBF v1 数据集');
  for (const [name, value] of Object.entries({ name: '测试用户', affiliation: '测试单位', email: 'test@example.com', usage: '自动化测试' })) {
    await page.locator(`#request_form [name="${name}"]`).fill(value);
  }
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(api, async route => {
    assert.equal(route.request().method(), 'POST');
    assert.ok(route.request().postData().includes('GBA-UBF v1 数据集'));
    await gate;
    await route.fulfill({ json: { success: true } });
  });
  await submit(page, 'request_form');
  await page.evaluate(() => {
    document.getElementById('request_modal').close();
    openRequestModal('DBNet数据集');
  });
  assert.equal(await page.locator('#modal_dataset_input').inputValue(), 'GBA-UBF v1 数据集');
  release();
  await visibleMessage(page, 'request-success');
  assert.equal(await page.locator('#modal_dataset_input').inputValue(), 'GBA-UBF v1 数据集');
  await page.evaluate(() => {
    document.getElementById('request_modal').close();
    openRequestModal(' DBNet数据集');
  });
  assert.equal(await page.locator('#modal_dataset_input').inputValue(), 'DBNet数据集');
  assert.equal(await page.locator('#request_form [name="name"]').inputValue(), '');
  assert.equal(await page.locator('#request-success').evaluate(el => el.classList.contains('hidden')), true);
});

test('single-image datasets do not loop and gallery controls belong to their own carousel', async t => {
  const { page } = await openPage(t, 'statistic.html');
  const galleries = await page.evaluate(() => window.swiperInstances.map(({ element, options }) => ({
    count: element.querySelectorAll('.swiper-slide').length,
    loop: options.loop,
    autoplay: options.autoplay,
    scoped: !options.navigation.nextEl || element.contains(options.navigation.nextEl)
  })));
  assert.equal(galleries.length, 7);
  for (const gallery of galleries) {
    assert.equal(gallery.loop, gallery.count > 1);
    if (gallery.count === 1) assert.equal(gallery.autoplay, false);
    assert.ok(gallery.scoped);
  }
  assert.deepEqual(await page.evaluate(() => {
    let args;
    window.open = (...values) => { args = values; };
    openPreview('https://example.com/image.png');
    return args;
  }), ['https://example.com/image.png', '_blank', 'noopener,noreferrer']);
});

test('footer HTTP errors are not inserted into the page', async t => {
  const { page } = await openPage(t);
  await page.route('**/footer.html', route => route.fulfill({ status: 404, contentType: 'text/html', body: '<div id="error-document">Missing footer</div>' }));
  const warning = page.waitForEvent('console', message => message.type() === 'warning' && message.text().includes('页脚加载失败'));
  await page.reload({ waitUntil: 'load' });
  await warning;
  assert.equal(await page.locator('#error-document').count(), 0);
});

test('a broken team photo falls back locally only once', async t => {
  const { page } = await openPage(t, 'team.html');
  let fallbacks = 0;
  await page.route('**/img/people/placeholder.svg', route => { fallbacks++; return route.fulfill({ status: 404, body: '' }); });
  await page.locator('img[onerror]').first().evaluate(image => { image.src = 'missing-test-photo.jpg'; });
  await page.waitForFunction(() => {
    const image = document.querySelector('img[src="img/people/placeholder.svg"]');
    return image && image.complete && image.onerror === null;
  });
  assert.equal(fallbacks, 1);
});
