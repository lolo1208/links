'use strict';

/**
 * config.yml 的加载与规范化。
 * 对外只暴露稳定的数据结构，模版层与抓取层不需要关心 YAML 的书写形式：
 *
 *   {
 *     title: string,
 *     groups: [
 *       { name: string, icon: string | null, links: [{ title: string | null, url: string }] }
 *     ]
 *   }
 *
 * title 为 null 表示配置里只写了 URL，构建时再去抓取页面 <title>。
 */

const fs = require('fs-extra');
const YAML = require('yaml');

const DEFAULT_SITE_TITLE = 'LINKS';
const GROUP_ICON_KEY = 'icon';

/** 配置结构化校验失败 */
class ConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConfigError';
    }
}

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const isGroupIconKey = (key) => String(key).trim().toLowerCase() === GROUP_ICON_KEY;

/**
 * 取出对象里的图标声明（`ICON: xxx.svg` / `icon: xxx.svg`）
 * @param {Record<string, unknown>} entry
 * @returns {{ found: boolean, icon: string | null }}
 */
function pickGroupIcon(entry) {
    for (const [key, value] of Object.entries(entry)) {
        if (isGroupIconKey(key)) {
            if (Object.keys(entry).length !== 1) {
                throw new ConfigError('ICON 必须独占一个数组项，不能与链接混写');
            }
            if (typeof value !== 'string' || !/^[\w-]+\.(svg|png|ico|gif|jpe?g|webp)$/i.test(value.trim())) {
                throw new ConfigError('ICON 必须是图标文件名，不能包含路径或查询参数');
            }
            return { found: true, icon: value.trim() };
        }
    }
    return { found: false, icon: null };
}

/**
 * 校验并规范化一个链接地址
 * @param {unknown} value
 * @param {string} location 出错时用于定位的路径描述
 */
function normalizeUrl(value, location) {
    const url = String(value ?? '').trim();
    if (!url) throw new ConfigError(`${location}：链接地址不能为空`);

    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new ConfigError(`${location}：不是合法的 URL -> ${url}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new ConfigError(`${location}：仅支持 http/https 链接 -> ${url}`);
    }
    return url;
}

/**
 * 规范化单个链接项，支持两种写法：
 *   - 只写地址：`- https://example.com`（构建时抓取页面标题作为名称）
 *   - 名称 + 地址：`- Example: https://example.com`
 * @param {unknown} rawLink
 * @param {string} location
 * @returns {{ title: string | null, url: string }}
 */
function normalizeLink(rawLink, location) {
    if (typeof rawLink === 'string') {
        return { title: null, url: normalizeUrl(rawLink, location) };
    }

    if (!isPlainObject(rawLink)) {
        throw new ConfigError(`${location}：链接项只能是字符串或「名称: 地址」形式`);
    }

    const entries = Object.entries(rawLink).filter(([key]) => !isGroupIconKey(key));
    if (entries.length !== 1) {
        throw new ConfigError(`${location}：链接项必须且只能包含一个「名称: 地址」`);
    }

    const [title, url] = entries[0];
    return { title: String(title).trim(), url: normalizeUrl(url, location) };
}

/**
 * 规范化一个分组，支持：
 *   - GitHub:                       <- 分组名
 *       - ICON: link.svg            <- 分组图标
 *       - GitHub: https://github.com
 * 也允许一个数组项里写多个分组。
 * @param {unknown} rawGroup
 * @param {string} location
 * @returns {Array<{ name: string, icon: string | null, links: Array<{ title: string | null, url: string }> }>}
 */
function normalizeGroups(rawGroup, location) {
    if (!isPlainObject(rawGroup)) {
        throw new ConfigError(`${location}：分组必须是「分组名: 链接数组」形式`);
    }

    return Object.entries(rawGroup).map(([name, rawLinks]) => {
        if (!name.trim()) throw new ConfigError(`${location}：分组名不能为空`);
        const groupLocation = `${location}.${name}`;
        if (!Array.isArray(rawLinks)) {
            throw new ConfigError(`${groupLocation}：必须是链接数组`);
        }

        let icon = null;
        const links = [];

        rawLinks.forEach((item, index) => {
            const itemLocation = `${groupLocation}[${index}]`;

            if (isPlainObject(item)) {
                const groupIcon = pickGroupIcon(item);
                if (groupIcon.found) {
                    icon = groupIcon.icon;
                    return;
                }
            }

            links.push(normalizeLink(item, itemLocation));
        });

        return { name: String(name).trim(), icon, links };
    });
}

/**
 * 规范化整份配置
 * @param {unknown} raw
 * @param {string} [source] 配置文件路径，仅用于错误提示
 */
function normalizeConfig(raw, source = 'config.yml') {
    if (!isPlainObject(raw)) {
        throw new ConfigError(`${source}：配置内容必须是一个对象`);
    }

    const rawTitle = typeof raw.title === 'string' ? raw.title.trim() : '';
    const title = rawTitle || DEFAULT_SITE_TITLE;

    if (!Array.isArray(raw.links)) {
        throw new ConfigError(`${source}：缺少 links 数组`);
    }

    const groups = raw.links.flatMap((group, index) => normalizeGroups(group, `links[${index}]`));

    if (groups.length === 0) {
        throw new ConfigError(`${source}：links 中没有任何分组`);
    }

    return { title, groups };
}

/**
 * 读取并解析配置文件
 * @param {string} file
 * @returns {Promise<{ title: string, groups: ReturnType<typeof normalizeGroups> }>}
 */
async function loadConfig(file) {
    const text = await fs.readFile(file, 'utf8');

    let raw;
    try {
        raw = YAML.parse(text);
    } catch (error) {
        throw new ConfigError(`${file}：YAML 解析失败 -> ${error.message}`);
    }

    return normalizeConfig(raw, file);
}

module.exports = {
    ConfigError,
    loadConfig,
    normalizeConfig,
    DEFAULT_SITE_TITLE,
};
