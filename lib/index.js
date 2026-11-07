'use strict';

/**
 * 对外 API。
 * 构建脚本与未来的其他入口都通过这里引用，保持模块边界稳定。
 */

const { SiteBuilder } = require('./site-builder');
const { clean } = require('./clean');
const { createLogger } = require('./logger');
const paths = require('./paths');

/**
 * 构建站点
 * @param {ConstructorParameters<typeof SiteBuilder>[0]} [options]
 */
function buildSite(options = {}) {
    return new SiteBuilder(options).build();
}

module.exports = {
    buildSite,
    clean,
    createLogger,
    paths,
    SiteBuilder,
};
