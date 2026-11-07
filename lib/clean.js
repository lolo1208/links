'use strict';

/**
 * 清理构建产物与本地缓存。
 * 用法：npm run clean，或 node lib/clean.js
 */

const fs = require('fs-extra');

const { ROOT_DIR, DIST_DIR, CACHE_DIR } = require('./paths');
const { createLogger } = require('./logger');

const TARGETS = [DIST_DIR, CACHE_DIR];

/**
 * 删除 dist 与 .cache
 * @param {{ logger?: object }} [options]
 */
async function clean(options = {}) {
    const logger = options.logger ?? createLogger();
    logger.title('清理构建产物');

    for (const target of TARGETS) {
        const removed = await fs.pathExists(target);
        await fs.remove(target);
        const label = target.replace(ROOT_DIR, '.').replace(/\\/g, '/');
        if (removed) logger.ok(`已删除 ${label}`);
        else logger.info(`跳过 ${label}（不存在）`);
    }
}

if (require.main === module) {
    clean().catch((error) => {
        console.error('清理失败：', error);
        process.exitCode = 1;
    });
}

module.exports = { clean };
