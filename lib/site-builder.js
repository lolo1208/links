'use strict';

/**
 * 站点构建流程编排。
 *
 * 步骤：读取配置/模版 → 解析 favicon 与页面标题 → 渲染导航与分组
 *      → 压缩 HTML/CSS → 拷贝图标 → 写回抓取缓存
 */

const fs = require('fs-extra');

const paths = require('./paths');
const template = require('./template');
const assets = require('./assets');
const { loadConfig } = require('./config');
const { FaviconResolver } = require('./favicon');
const { PageTitleResolver } = require('./page-title');
const { mapWithConcurrency } = require('./concurrency');
const { createLogger } = require('./logger');

/** 网络请求的默认并发数 */
const DEFAULT_CONCURRENCY = 6;

/**
 * 格式化文件大小
 * @param {number} bytes
 */
function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
}

class SiteBuilder {
    /**
     * @param {{
     *   concurrency?: number,
     *   faviconTimeout?: number,
     *   titleTimeout?: number,
     *   faviconProviders?: Array<(url: URL) => string>,
     *   refresh?: boolean,
     *   logger?: object,
     * }} [options]
     */
    constructor(options = {}) {
        const {
            concurrency = DEFAULT_CONCURRENCY,
            faviconTimeout,
            titleTimeout,
            faviconProviders,
            refresh = false,
            logger = createLogger(),
        } = options;

        this.concurrency = concurrency;
        this.faviconTimeout = faviconTimeout;
        this.titleTimeout = titleTimeout;
        this.faviconProviders = faviconProviders;
        this.refresh = refresh;
        this.logger = logger;
    }

    /**
     * 执行构建
     * @returns {Promise<{
     *   title: string, groups: number, links: number, missingIcons: number, icons: number,
     *   htmlBytes: number, cssSourceBytes: number, cssBytes: number,
     * }>}
     */
    async build() {
        const logger = this.logger;

        logger.title('读取配置与模版');
        const config = await loadConfig(paths.SRC_CONFIG_FILE);
        const pageTemplate = await fs.readFile(paths.SRC_TEMPLATE_FILE, 'utf8');
        logger.info(`站点标题：${config.title}`);
        logger.info(`分组数量：${config.groups.length}`);

        const favicons = new FaviconResolver({
            outputDir: paths.DIST_FAVICONS_DIR,
            publicPath: paths.PUBLIC_FAVICONS_DIR,
            providers: this.faviconProviders,
            timeout: this.faviconTimeout,
            failureCacheFile: paths.FAVICON_FAILURE_CACHE_FILE,
            ignoreFailureCache: this.refresh,
            logger,
        });
        const titles = new PageTitleResolver({
            cacheFile: paths.PAGE_TITLE_CACHE_FILE,
            timeout: this.titleTimeout,
            logger,
        });

        await favicons.init();
        await titles.load();

        logger.title('生成链接');
        const navItems = [];
        const sections = [];
        let linkCount = 0;
        let missingIconCount = 0;

        for (const [index, group] of config.groups.entries()) {
            const anchor = `group-${index + 1}`;
            const iconFile = group.icon || paths.DEFAULT_GROUP_ICON;
            const iconPath = `${paths.PUBLIC_ICONS_DIR}/${iconFile}`;
            const noneIconPath = `${paths.PUBLIC_ICONS_DIR}/${paths.DEFAULT_LINK_ICON}`;

            logger.info(`${group.name}（${group.links.length} 个链接）`);

            const linkItems = await mapWithConcurrency(group.links, this.concurrency, async (link) => {
                const [faviconPath, label] = await Promise.all([
                    favicons.resolve(link.url),
                    link.title === null ? titles.resolve(link.url) : Promise.resolve(link.title),
                ]);

                if (faviconPath) {
                    logger.ok(link.url);
                } else {
                    missingIconCount += 1;
                    logger.fail(link.url);
                }

                return template.renderLinkItem({
                    icon: faviconPath ?? noneIconPath,
                    label: label || link.url,
                    url: link.url,
                });
            });

            linkCount += linkItems.length;
            navItems.push(template.renderNavItem({ anchor, icon: iconPath, label: group.name }));
            sections.push(
                template.renderGroup({
                    anchor,
                    icon: iconPath,
                    label: group.name,
                    color: template.groupIconModifier(index),
                    links: linkItems,
                })
            );
        }

        logger.title('输出站点文件');

        const html = await assets.minifyHtml(
            template.renderPage({
                template: pageTemplate,
                title: config.title,
                navigation: navItems.join('\n'),
                content: sections.join('\n'),
            })
        );
        await fs.outputFile(paths.DIST_INDEX_FILE, html);
        const htmlBytes = Buffer.byteLength(html);
        logger.ok(`index.html（${formatBytes(htmlBytes)}）`);

        const styles = await assets.writeStylesheet({
            source: paths.SRC_STYLES_FILE,
            target: paths.DIST_STYLES_FILE,
        });
        logger.ok(`styles.css（${formatBytes(styles.sourceBytes)} → ${formatBytes(styles.outputBytes)}）`);

        const iconCount = await assets.copyIcons({
            source: paths.SRC_ICONS_DIR,
            target: paths.DIST_ICONS_DIR,
        });
        logger.ok(`icons（${iconCount} 个文件）`);

        await fs.copyFile(paths.SRC_FAVICON_FILE, paths.DIST_FAVICON_FILE);
        logger.ok('favicon.ico');

        // 写回抓取缓存，下次构建不再请求已失败的资源
        await favicons.save();
        await titles.save();

        return {
            title: config.title,
            groups: config.groups.length,
            links: linkCount,
            missingIcons: missingIconCount,
            icons: iconCount,
            htmlBytes,
            cssSourceBytes: styles.sourceBytes,
            cssBytes: styles.outputBytes,
        };
    }
}

module.exports = { SiteBuilder, DEFAULT_CONCURRENCY };
