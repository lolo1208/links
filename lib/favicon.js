'use strict';

/**
 * favicon 解析器。
 *
 * 图标按 provider 顺序依次尝试（默认：favicon 服务 → 站点 /favicon.ico → 页面 <link rel="icon">），
 * 下载结果保存到 dist/favicons/，该目录同时充当缓存：
 * 文件名以主机名命名，已存在则直接复用，同一次构建内相同主机只请求一次。
 *
 * 两类优化：
 * - 公共 provider（favicon 服务）被墙或限流时，连续失败若干次即在本次构建内停用；
 * - 单个源失败后继续回退，避免无效响应或局部故障阻止页面图标解析。
 */

const path = require('node:path');
const fs = require('fs-extra');

const { fetchWithTimeout, fetchText } = require('./http');

/** 按响应类型决定保存的文件后缀 */
const CONTENT_TYPE_EXTENSIONS = {
    'image/x-icon': '.ico',
    'image/vnd.microsoft.icon': '.ico',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/jpeg': '.jpg',
    'image/svg+xml': '.svg',
    'image/webp': '.webp',
    'image/avif': '.avif',
};

const FALLBACK_EXTENSION = '.png';
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|\s]/g;
const LINK_TAG_PATTERN = /<link\b[^>]*>/gi;
const REL_PATTERN = /rel\s*=\s*["']?([^"'>]+)/i;
const HREF_PATTERN = /href\s*=\s*["']?([^"'\s>]+)/i;

/** 默认超时时间 */
const DEFAULT_TIMEOUT_MS = 6000;
/** 公共 provider 连续失败多少次后停用 */
const DEFAULT_FAILURE_LIMIT = 8;
/** favicon 失败记录的保留时长（默认 7 天） */
const DEFAULT_FAILURE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 从页面 HTML 中找出图标地址
 * @param {string} html
 * @param {URL} baseUrl 用于解析相对路径
 * @returns {string | null}
 */
function findIconHref(html, baseUrl) {
    const candidates = { icon: [], touch: [] };

    for (const tag of html.match(LINK_TAG_PATTERN) ?? []) {
        const rel = (tag.match(REL_PATTERN)?.[1] ?? '').trim().toLowerCase();
        const href = tag.match(HREF_PATTERN)?.[1];
        if (!href) continue;

        if (/(^|\s)(shortcut\s+)?icon(\s|$)/.test(rel)) candidates.icon.push(href);
        else if (/apple-touch-icon/.test(rel)) candidates.touch.push(href);
    }

    const href = candidates.icon[0] ?? candidates.touch[0];
    if (!href) return null;

    try {
        return new URL(href, baseUrl).href;
    } catch {
        return null;
    }
}

/**
 * 内置 provider
 * - `shared`：所有站点共用的服务，失败次数可以触发停用
 * - `hostDependent`：依赖目标主机，出现网络错误即表示主机不可达
 */
const providers = {
    /** Google favicon 服务，返回 64px 图标 */
    google: {
        name: 'google',
        shared: true,
        buildUrl: (url) => `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(url.hostname)}`,
    },
    /** 站点根目录下的 favicon.ico */
    site: {
        name: 'site',
        hostDependent: true,
        buildUrl: (url) => `${url.origin}/favicon.ico`,
    },
    /** 解析页面中的 <link rel="icon"> */
    html: {
        name: 'html',
        hostDependent: true,
        buildUrl: async (url, { timeout }) => {
            const html = await fetchText(url.href, { timeout });
            const iconHref = findIconHref(html, url);
            if (!iconHref) throw new Error('页面没有声明图标');
            return iconHref;
        },
    },
};

const DEFAULT_PROVIDERS = [providers.google, providers.site, providers.html];

/**
 * 归一化主机名：小写、去掉 www. 前缀与末尾点，避免同一站点重复下载
 * @param {string} hostname
 */
function normalizeHostname(hostname) {
    return String(hostname || '')
        .trim()
        .toLowerCase()
        .replace(/\.$/, '')
        .replace(/^www\./, '');
}

/** 主机名转成安全的文件名片段（端口号等内容会包含非法字符） */
const toFileName = (hostname) => hostname.replace(INVALID_FILENAME_CHARS, '_');

/** 允许传入函数形式的自定义 provider */
const toProvider = (provider) => (typeof provider === 'function' ? { buildUrl: provider } : provider);

class FaviconResolver {
    /**
     * @param {{
     *   outputDir: string,
     *   publicPath: string,
     *   providers?: Array<Function | { name?: string, buildUrl: Function, shared?: boolean, hostDependent?: boolean }>,
     *   timeout?: number,
     *   failureLimit?: number,
     *   failureCacheFile?: string | null,
     *   failureTtlMs?: number,
     *   ignoreFailureCache?: boolean,
     *   logger?: object,
     * }} options
     */
    constructor({
        outputDir,
        publicPath,
        providers: providerList = DEFAULT_PROVIDERS,
        timeout = DEFAULT_TIMEOUT_MS,
        failureLimit = DEFAULT_FAILURE_LIMIT,
        failureCacheFile = null,
        failureTtlMs = DEFAULT_FAILURE_TTL_MS,
        ignoreFailureCache = false,
        logger,
    }) {
        this.outputDir = outputDir;
        this.publicPath = publicPath;
        this.providers = providerList.map(toProvider);
        this.timeout = timeout;
        this.failureLimit = failureLimit;
        this.failureCacheFile = failureCacheFile;
        this.failureTtlMs = failureTtlMs;
        this.ignoreFailureCache = ignoreFailureCache;
        this.logger = logger;

        /** @type {Map<string, string>} hostname -> 文件名 */
        this.index = new Map();
        /** @type {Map<string, Promise<string | null>>} 构建期间的请求去重 */
        this.pending = new Map();
        /** @type {Map<string, number>} hostname -> 最近一次失败时间 */
        this.failures = new Map();
        /** 失败记录是否有变更 */
        this.failureDirty = false;
        /** 各 provider 的失败计数与停用状态 */
        this.providerState = this.providers.map(() => ({ failures: 0, disabled: false }));
    }

    /** 建立现有缓存索引，并载入失败记录 */
    async init() {
        await fs.ensureDir(this.outputDir);
        const files = await fs.readdir(this.outputDir);
        for (const file of files) {
            const hostname = normalizeHostname(path.parse(file).name);
            if (hostname) this.index.set(hostname, file);
        }
        this.logger?.debug(`favicon 缓存：${this.index.size} 个`);
        await this.#loadFailures();
    }

    /**
     * 解析链接对应的 favicon
     * @param {string} url
     * @returns {Promise<string | null>} 页面中的相对路径，失败返回 null
     */
    async resolve(url) {
        let parsed;
        try {
            parsed = new URL(url);
        } catch {
            return null;
        }

        const hostname = normalizeHostname(parsed.hostname);
        if (!hostname) return null;

        const cached = this.index.get(hostname);
        if (cached) return this.toPublicPath(cached);

        if (this.#isKnownFailure(hostname)) {
            this.logger?.debug(`跳过近期失败过的 host：${hostname}`);
            return null;
        }

        // 同一主机在本次构建中可能被多个链接引用，复用同一个 Promise
        const inflight = this.pending.get(hostname);
        if (inflight) return inflight;

        const task = this.#download(parsed, hostname).finally(() => this.pending.delete(hostname));
        this.pending.set(hostname, task);
        return task;
    }

    toPublicPath(fileName) {
        return `${this.publicPath}/${fileName}`;
    }

    /**
     * 依次尝试各 provider 下载并保存 favicon
     * @param {URL} url
     * @param {string} hostname
     * @returns {Promise<string | null>}
     */
    async #download(url, hostname) {
        for (const [index, provider] of this.providers.entries()) {
            const state = this.providerState[index];
            if (state.disabled) continue;

            try {
                const saved = await this.#fetchFrom(provider, url, hostname);
                state.failures = 0;
                this.#markSuccess(hostname);
                return saved;
            } catch (error) {
                this.logger?.debug(
                    `favicon 获取失败（${provider.name ?? `provider#${index + 1}`}）：${hostname}（${error.message}）`
                );

                this.#recordFailure(provider, state, index);
            }
        }

        this.#markFailure(hostname);
        return null;
    }

    /**
     * 从单个 provider 取回图标并写盘
     * @param {{ buildUrl: Function }} provider
     * @param {URL} url
     * @param {string} hostname
     * @returns {Promise<string>}
     */
    async #fetchFrom(provider, url, hostname) {
        const iconUrl = await provider.buildUrl(url, { timeout: this.timeout });
        const { response, buffer } = await fetchWithTimeout(iconUrl, {
            timeout: this.timeout,
            responseType: 'buffer',
        });
        const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();

        if (!contentType.startsWith('image/')) {
            throw new Error(`响应类型不是图片：${contentType || 'unknown'}`);
        }

        if (buffer.length === 0) throw new Error('响应内容为空');

        const extension = CONTENT_TYPE_EXTENSIONS[contentType] ?? FALLBACK_EXTENSION;
        const fileName = `${toFileName(hostname)}${extension}`;
        await fs.outputFile(path.join(this.outputDir, fileName), buffer);

        this.index.set(hostname, fileName);
        return this.toPublicPath(fileName);
    }

    /** 公共 provider 连续失败达到阈值时，在本次构建内停用 */
    #recordFailure(provider, state, index) {
        if (!provider.shared) return;

        state.failures += 1;
        if (state.disabled || state.failures < this.failureLimit) return;

        state.disabled = true;
        this.logger?.warn(
            `favicon 源「${provider.name ?? index + 1}」连续失败 ${state.failures} 次，本次构建内不再使用`
        );
    }

    /** 读取失败记录（过期条目直接丢弃） */
    async #loadFailures() {
        if (!this.failureCacheFile || this.ignoreFailureCache) return;

        try {
            const data = await fs.readJson(this.failureCacheFile);
            const now = Date.now();
            for (const [hostname, timestamp] of Object.entries(data ?? {})) {
                if (typeof timestamp !== 'number') continue;
                if (now - timestamp <= this.failureTtlMs) this.failures.set(hostname, timestamp);
            }
            this.logger?.debug(`favicon 失败记录：${this.failures.size} 个`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                this.logger?.warn(`favicon 失败记录读取失败，已忽略：${error.message}`);
            }
        }
    }

    /** 该主机是否近期失败过 */
    #isKnownFailure(hostname) {
        if (this.ignoreFailureCache) return false;
        const timestamp = this.failures.get(hostname);
        return timestamp !== undefined && Date.now() - timestamp <= this.failureTtlMs;
    }

    #markFailure(hostname) {
        if (!this.failureCacheFile) return;
        this.failures.set(hostname, Date.now());
        this.failureDirty = true;
    }

    #markSuccess(hostname) {
        if (!this.failures.delete(hostname)) return;
        this.failureDirty = true;
    }

    /** 失败记录有变化时写回磁盘 */
    async save() {
        if (!this.failureCacheFile || !this.failureDirty) return;

        const now = Date.now();
        const data = Object.fromEntries(
            [...this.failures.entries()]
                .filter(([, timestamp]) => now - timestamp <= this.failureTtlMs)
                .sort(([a], [b]) => a.localeCompare(b))
        );
        await fs.outputJson(this.failureCacheFile, data, { spaces: 2 });
        this.logger?.debug(`favicon 失败记录已更新：${Object.keys(data).length} 个`);
    }
}

module.exports = { FaviconResolver, normalizeHostname, findIconHref, providers, DEFAULT_PROVIDERS };
