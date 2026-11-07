'use strict';

/**
 * 页面模版渲染。
 * 模版文件只保留页面骨架，导航与内容由这里的函数生成，
 * 生成过程中所有动态文本都会转义，避免标题或链接里的特殊字符破坏 HTML。
 */

const PLACEHOLDERS = {
    title: '{{title}}',
    navigation: '{{navigation}}',
    content: '{{content}}',
};

/** 分组图标的配色，按分组顺序循环取用（保证每次构建结果一致） */
const GROUP_ICON_COLORS = ['green', 'orange', 'red', 'blue', 'purple'];

const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
};

const ATTRIBUTE_ESCAPES = {
    ...HTML_ESCAPES,
    '"': '&quot;',
    "'": '&#39;',
};

const escapeWith = (map) => (value) => String(value ?? '').replace(/[&<>"']/g, (char) => map[char] ?? char);

/** 转义文本节点 */
const escapeHtml = escapeWith(HTML_ESCAPES);
/** 转义属性值 */
const escapeAttribute = escapeWith(ATTRIBUTE_ESCAPES);

/** 按分组序号取配色修饰符 */
function groupIconModifier(index) {
    return GROUP_ICON_COLORS[index % GROUP_ICON_COLORS.length];
}

/** 左侧导航项 */
function renderNavItem({ anchor, icon, label }) {
    return `<a class="nav-item" href="#${escapeAttribute(anchor)}">
        <span class="nav-item__icon"><img src="${escapeAttribute(icon)}" alt=""></span>
        <span class="nav-item__label">${escapeHtml(label)}</span>
    </a>`;
}

/** 右侧链接项 */
function renderLinkItem({ icon, label, url }) {
    return `<a class="link-item" href="${escapeAttribute(url)}">
        <span class="link-item__inner">
            <img class="link-item__icon" src="${escapeAttribute(icon)}" alt="">
            <span class="link-item__label">${escapeHtml(label)}</span>
        </span>
    </a>`;
}

/** 右侧分组 */
function renderGroup({ anchor, icon, label, color, links }) {
    return `<section class="group">
        <div class="group__header">
            <span id="${escapeAttribute(anchor)}" class="group__icon group__icon--${color}"><img src="${escapeAttribute(icon)}" alt=""></span>
            <p class="group__title">${escapeHtml(label)}</p>
        </div>
        <div class="link-grid">
            ${links.join('\n')}
        </div>
    </section>`;
}

/**
 * 把导航与内容填充进模版
 * @param {{ template: string, title: string, navigation: string, content: string }} params
 */
function renderPage({ template, title, navigation, content }) {
    const values = { title: escapeHtml(title), navigation, content };
    // 一次替换，避免 $& 等替换语法以及插入内容中的占位符被再次解析。
    return template.replace(/\{\{(title|navigation|content)\}\}/g, (_, key) => values[key]);
}

module.exports = {
    PLACEHOLDERS,
    GROUP_ICON_COLORS,
    escapeHtml,
    escapeAttribute,
    groupIconModifier,
    renderNavItem,
    renderLinkItem,
    renderGroup,
    renderPage,
};
