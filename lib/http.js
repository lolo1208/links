'use strict';

/**
 * 基于 Node.js 内置 fetch 的极简请求封装。
 * 取代已停止维护的 request 依赖，并提供统一的超时处理。
 */

const DEFAULT_TIMEOUT_MS = 5000;

const DEFAULT_HEADERS = {
    // 部分站点会拒绝没有 UA 的请求
    'user-agent': 'Mozilla/5.0 (compatible; links-build/1.0)',
};

/** 服务端返回了非 2xx 状态码（说明网络是通的，只是资源不可用） */
class HttpStatusError extends Error {
    /**
     * @param {number} status
     * @param {string} statusText
     * @param {string} url
     */
    constructor(status, statusText, url) {
        super(`HTTP ${status} ${statusText || ''}`.trim() + `：${url}`);
        this.name = 'HttpStatusError';
        this.status = status;
        this.url = url;
    }
}

/**
 * 发起 HTTP 请求，带超时与状态码校验
 * @param {string} url
 * responseType 为 text/buffer 时，超时覆盖响应体读取，并执行大小限制。
 * 未指定时返回原始 Response，由调用方负责响应体生命周期。
 * @param {RequestInit & { timeout?: number, responseType?: 'text' | 'buffer', maxBytes?: number }} [options]
 * @returns {Promise<Response | string | { response: Response, buffer: Buffer }>}
 */
async function fetchWithTimeout(url, options = {}) {
    const { timeout = DEFAULT_TIMEOUT_MS, headers, responseType, maxBytes = 5 * 1024 * 1024, ...init } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => {
        controller.abort(new Error(`请求超时（${timeout}ms）：${url}`));
    }, timeout);
    timer.unref?.();

    try {
        const response = await fetch(url, {
            redirect: 'follow',
            ...init,
            headers: { ...DEFAULT_HEADERS, ...headers },
            signal: controller.signal,
        });

        if (!response.ok) {
            await response.body?.cancel();
            throw new HttpStatusError(response.status, response.statusText, url);
        }

        if (!responseType) return response;

        // 在同一个超时窗口内读取响应体，同时限制解压后的实际大小。
        const chunks = [];
        let bytes = 0;
        try {
            for await (const chunk of response.body ?? []) {
                bytes += chunk.length;
                if (bytes > maxBytes) throw new Error(`响应内容超过限制（${maxBytes} 字节）`);
                chunks.push(chunk);
            }
        } catch (error) {
            controller.abort();
            throw error;
        }
        const buffer = Buffer.concat(chunks);
        return responseType === 'text' ? buffer.toString('utf8') : { response, buffer };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 获取文本响应
 * @param {string} url
 * @param {{ timeout?: number, headers?: Record<string, string> }} [options]
 * @returns {Promise<string>}
 */
async function fetchText(url, options = {}) {
    return fetchWithTimeout(url, { ...options, responseType: 'text' });
}

module.exports = { fetchWithTimeout, fetchText, HttpStatusError, DEFAULT_TIMEOUT_MS };
