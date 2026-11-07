'use strict';

/**
 * 项目内的路径常量。
 * 所有脚本共享同一份定义，避免各自的 __dirname 拼接出现差异。
 */

const path = require('node:path');

/** 项目根目录 */
const ROOT_DIR = path.resolve(__dirname, '..');

/* ------------------------------- 源文件 ------------------------------- */

/** 源文件目录 */
const SRC_DIR = path.join(ROOT_DIR, 'src');
/** 站点图标源目录 */
const SRC_ICONS_DIR = path.join(SRC_DIR, 'icons');
/** 网站 favicon 源文件 */
const SRC_FAVICON_FILE = path.join(SRC_DIR, 'favicon.ico');
/** 站点样式源文件 */
const SRC_STYLES_FILE = path.join(SRC_DIR, 'styles.css');
/** 页面模版文件 */
const SRC_TEMPLATE_FILE = path.join(SRC_DIR, 'template.html');
/** 链接配置文件 */
const SRC_CONFIG_FILE = path.join(ROOT_DIR, 'config.yml');

/* ------------------------------- 构建产物 ------------------------------ */

/** 构建产物目录 */
const DIST_DIR = path.join(ROOT_DIR, 'dist');
/** 构建产物中的图标目录 */
const DIST_ICONS_DIR = path.join(DIST_DIR, 'icons');
/** 构建产物中的 favicon 目录（同时作为下载缓存） */
const DIST_FAVICONS_DIR = path.join(DIST_DIR, 'favicons');
/** 生成的首页 */
const DIST_INDEX_FILE = path.join(DIST_DIR, 'index.html');
/** 构建产物中的网站 favicon */
const DIST_FAVICON_FILE = path.join(DIST_DIR, 'favicon.ico');
/** 压缩后的样式文件 */
const DIST_STYLES_FILE = path.join(DIST_DIR, 'styles.css');

/* -------------------------------- 缓存 -------------------------------- */

/** 本地缓存目录（不参与部署） */
const CACHE_DIR = path.join(ROOT_DIR, '.cache');
/** 页面 <title> 抓取结果缓存 */
const PAGE_TITLE_CACHE_FILE = path.join(CACHE_DIR, 'page-titles.json');
/** favicon 抓取失败记录（避免每次构建都重试同一批死链） */
const FAVICON_FAILURE_CACHE_FILE = path.join(CACHE_DIR, 'favicon-failures.json');

/* ------------------------------ 站点内路径 ----------------------------- */

/** 图标在页面中的相对路径 */
const PUBLIC_ICONS_DIR = 'icons';
/** favicon 在页面中的相对路径 */
const PUBLIC_FAVICONS_DIR = 'favicons';
/** 分组未配置图标时使用的默认图标（相对 src/icons） */
const DEFAULT_GROUP_ICON = 'missing.svg';
/** 链接未取到 favicon 时使用的图标（相对 src/icons） */
const DEFAULT_LINK_ICON = 'none.svg';

module.exports = {
    ROOT_DIR,
    SRC_DIR,
    SRC_ICONS_DIR,
    SRC_FAVICON_FILE,
    SRC_STYLES_FILE,
    SRC_TEMPLATE_FILE,
    SRC_CONFIG_FILE,
    DIST_DIR,
    DIST_ICONS_DIR,
    DIST_FAVICONS_DIR,
    DIST_INDEX_FILE,
    DIST_FAVICON_FILE,
    DIST_STYLES_FILE,
    CACHE_DIR,
    PAGE_TITLE_CACHE_FILE,
    FAVICON_FAILURE_CACHE_FILE,
    PUBLIC_ICONS_DIR,
    PUBLIC_FAVICONS_DIR,
    DEFAULT_GROUP_ICON,
    DEFAULT_LINK_ICON,
};
