#!/usr/bin/env node

'use strict';

/**
 * 构建入口（npm run build）。
 * 只负责解析命令行参数、组织日志与退出码，实际流程在 site-builder.js 中。
 */

const paths = require('./paths');
const { buildSite, clean, createLogger } = require('./index');

const HELP = `
用法：node lib/build.js [选项]

选项：
  -v, --verbose   输出调试信息（缓存命中、抓取失败原因等）
      --clean     构建前先清理 dist 与 .cache
      --refresh   忽略 favicon 失败记录，重新尝试所有链接
  -h, --help      显示帮助
`;

/**
 * 解析命令行参数
 * @param {string[]} argv
 */
function parseArgs(argv) {
    const options = { verbose: false, clean: false, refresh: false, help: false };

    for (const arg of argv) {
        switch (arg) {
            case '-v':
            case '--verbose':
                options.verbose = true;
                break;
            case '--clean':
                options.clean = true;
                break;
            case '--refresh':
                options.refresh = true;
                break;
            case '-h':
            case '--help':
                options.help = true;
                break;
            default:
                throw new Error(`未知参数：${arg}（使用 --help 查看用法）`);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        console.log(HELP.trim());
        return;
    }

    const logger = createLogger({ verbose: options.verbose });
    const startedAt = Date.now();

    if (options.clean) await clean({ logger });

    logger.title('开始构建');
    const stats = await buildSite({ logger, refresh: options.refresh });

    logger.title('构建完成');
    logger.info(`${stats.groups} 个分组 / ${stats.links} 个链接`);
    if (stats.missingIcons > 0) {
        logger.info(`${stats.missingIcons} 个链接未获取到 favicon，已使用默认图标`);
    }
    logger.info(`输出目录：${paths.DIST_DIR}`);
    logger.info(`耗时：${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main().catch((error) => {
    console.error(`\n构建失败：${error.message}`);
    if (error.name === 'ConfigError') {
        console.error('请检查 config.yml 的书写格式。');
    }
    process.exitCode = 1;
});
