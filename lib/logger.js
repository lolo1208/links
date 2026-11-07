'use strict';

/**
 * 控制台输出工具。
 * 统一各步骤的日志格式，避免脚本里散落 console.log。
 */

const SYMBOL_OK = '✓';
const SYMBOL_FAIL = '✕';
const SYMBOL_DEBUG = '·';
const SYMBOL_WARN = '!';

const noop = () => {};

/**
 * 创建日志器
 * @param {{ verbose?: boolean }} [options]
 */
function createLogger(options = {}) {
    const { verbose = false } = options;

    return {
        /** 段落标题 */
        title: (message) => console.log(`\n${message}`),
        /** 普通信息 */
        info: (message) => console.log(`  ${message}`),
        /** 成功项 */
        ok: (message) => console.log(`  [${SYMBOL_OK}] ${message}`),
        /** 失败项 */
        fail: (message) => console.log(`  [${SYMBOL_FAIL}] ${message}`),
        /** 警告 */
        warn: (message) => console.warn(`  [${SYMBOL_WARN}] ${message}`),
        /** 错误 */
        error: (message) => console.error(message),
        /** 详细调试信息，仅 --verbose 时输出 */
        debug: verbose ? (message) => console.log(`  [${SYMBOL_DEBUG}] ${message}`) : noop,
    };
}

module.exports = { createLogger };
