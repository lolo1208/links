'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { normalizeConfig } = require('../lib/config');
const { renderPage, renderLinkItem } = require('../lib/template');
const { decodeEntities } = require('../lib/page-title');
const { fetchText, HttpStatusError } = require('../lib/http');
const { FaviconResolver } = require('../lib/favicon');
const { mapWithConcurrency } = require('../lib/concurrency');

test('模板内容保持字面值，且不递归展开占位符', () => {
    assert.equal(renderPage({ template: '{{title}}|{{navigation}}|{{content}}', title: '$& {{content}}', navigation: '$`', content: '正文' }), '$&amp; {{content}}|$`|正文');
    assert.match(renderLinkItem({ icon: 'a', label: '<script>', url: 'https://example.com/"' }), /&lt;script&gt;/);
});

test('配置拒绝混写图标、路径及空分组名', () => {
    for (const links of [
        [{ A: [{ ICON: 'link.svg', Example: 'https://example.com' }] }],
        [{ A: [{ ICON: '../link.svg' }] }],
        [{ ' ': [] }],
        [{ A: ['javascript:alert(1)'] }],
    ]) assert.throws(() => normalizeConfig({ links }), { name: 'ConfigError' });
    assert.equal(normalizeConfig({ links: [{ A: ['https://example.com'] }] }).groups.length, 1);
});

test('无效数字实体不使整个标题解析失败', () => {
    assert.equal(decodeEntities('A &#x110000; &#55296; &#0; &#x1F600; &amp;'), 'A \uFFFD \uFFFD \uFFFD 😀 &');
});

test('站点图标源失败后仍尝试后续源', async () => {
    let calls = 0;
    const resolver = new FaviconResolver({ outputDir: '.', publicPath: 'favicons', providers: [
        { hostDependent: true, buildUrl() { calls++; throw new Error('无效图片'); } },
        { buildUrl() { calls++; throw new Error('测试回退'); } },
    ] });
    assert.equal(await resolver.resolve('https://example.com'), null);
    assert.equal(calls, 2);
});

test('受控并发保持顺序并限制任务数', async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([3, 2, 1], 2, async (n) => {
        peak = Math.max(peak, ++active);
        await new Promise(resolve => setTimeout(resolve, n));
        active--;
        return n * 2;
    });
    assert.deepEqual(result, [6, 4, 2]);
    assert.equal(peak, 2);
});

test('HTTP 覆盖响应体超时、大小限制及非成功状态', async () => {
    const server = http.createServer((req, res) => {
        if (req.url === '/slow') {
            res.writeHead(200);
            res.write('开始');
            return;
        }
        if (req.url === '/error') res.statusCode = 404;
        res.end('hello');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        assert.equal(await fetchText(base), 'hello');
        await assert.rejects(fetchText(`${base}/error`), HttpStatusError);
        await assert.rejects(fetchText(base, { maxBytes: 2 }), /超过限制/);
        await assert.rejects(fetchText(`${base}/slow`, { timeout: 100 }));
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});
