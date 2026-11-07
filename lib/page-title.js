'use strict';

/**
 * 页面标题抓取器。
 * config.yml 里允许只写 URL，此时用目标页面的 <title> 作为链接名称。
 * 抓取结果会缓存到 .cache/page-titles.json，重复构建不再产生网络请求。
 */

const fs = require('fs-extra');

const { fetchText } = require('./http');

const TITLE_PATTERN = /<title[^>]*>([\s\S]*?)<\/title>/i;
const ENTITY_PATTERN = /&(#x[\da-f]+|#\d+|[a-z]+);/gi;

const NAMED_ENTITIES = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    hellip: '…',
    mdash: '—',
    ndash: '–',
};

/**
 * 解码 HTML 实体（只覆盖标题里常见的几种）
 * @param {string} text
 */
function decodeEntities(text) {
    return text.replace(ENTITY_PATTERN, (match, entity) => {
        if (entity.startsWith('#')) {
            const hex = /^#x/i.test(entity);
            const point = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
            return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
                ? String.fromCodePoint(point)
                : '\uFFFD';
        }
        return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    });
}

class PageTitleResolver {
    /**
     * @param {{ cacheFile: string, timeout?: number, logger?: object }} options
     */
    constructor({ cacheFile, timeout = 5000, logger }) {
        this.cacheFile = cacheFile;
        this.timeout = timeout;
        this.logger = logger;
        /** @type {Map<string, string>} */
        this.cache = new Map();
        /** 构建期间是否改动了缓存，用于决定是否落盘 */
        this.dirty = false;
    }

    /** 读取本地缓存 */
    async load() {
        try {
            const data = await fs.readJson(this.cacheFile);
            if (data && typeof data === 'object') {
                for (const [url, title] of Object.entries(data)) {
                    if (typeof title === 'string') this.cache.set(url, title);
                }
            }
            this.logger?.debug(`标题缓存：${this.cache.size} 条`);
        } catch (error) {
            // 缓存不存在或已损坏都不影响构建
            if (error.code !== 'ENOENT') {
                this.logger?.warn(`标题缓存读取失败，已忽略：${error.message}`);
            }
        }
    }

    /**
     * 解析页面标题
     * @param {string} url
     * @returns {Promise<string | null>} 失败返回 null，由调用方兜底
     */
    async resolve(url) {
        const cached = this.cache.get(url);
        if (cached) return cached;

        try {
            const html = await fetchText(url, { timeout: this.timeout });
            const matched = html.match(TITLE_PATTERN);
            const title = matched ? decodeEntities(matched[1]).replace(/\s+/g, ' ').trim() : '';

            if (title) {
                this.cache.set(url, title);
                this.dirty = true;
                return title;
            }

            this.logger?.debug(`页面没有 <title>：${url}`);
        } catch (error) {
            this.logger?.debug(`页面标题抓取失败：${url}（${error.message}）`);
        }

        return null;
    }

    /** 缓存有改动时写回磁盘 */
    async save() {
        if (!this.dirty) return;
        const data = Object.fromEntries([...this.cache.entries()].sort(([a], [b]) => a.localeCompare(b)));
        await fs.outputJson(this.cacheFile, data, { spaces: 2 });
        this.logger?.debug(`标题缓存已更新：${this.cacheFile}`);
    }
}

module.exports = { PageTitleResolver, decodeEntities };
