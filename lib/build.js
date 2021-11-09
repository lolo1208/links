/**
 * Created by LOLO on 2021/11/4.
 */


const path = require('path');
const URL = require('url');
const fs = require('fs-extra');
const request = require('request');
const YAML = require('yaml');
const CleanCSS = require('clean-css');
const htmlMinify = require('html-minifier');
const getFavicon = require('./get-favicon').getFavicon;


// src 目录
const DIR_SRC = path.normalize(__dirname + '/../src/');
// src/icon 目录
const DIR_SRC_ICON = DIR_SRC + 'icon/';
// css 文件
const PATH_STYLES = DIR_SRC + 'styles.css';
// html 模版文件
const PATH_HTML = DIR_SRC + 'template.html';
// 链接配置文件
const PATH_CFG = DIR_SRC + 'config.yaml';

// default icon
const ICO_MISSING = 'icon/missing.svg';
const ICO_NONE = 'icon/none.svg';

// 生成内容根目录
const DIR_DEST = path.normalize(__dirname + '/../dest/');
// dest/favicon 目录
const DIR_FAVINCON = DIR_DEST + 'favicon/';
// 生成内容根目录
const DIR_DEST_ICON = DIR_DEST + 'icon/';

// config.yaml 内容中的 ICON 替换关键字
const CFG_ICON = 'ICON';

// 模版内容中的替换关键字
const KEY_TITLE = '{{title}}';
const KEY_LEFT = '{{left}}';
const KEY_RIGHT = '{{right}}';

const KEY_ICON = '{{icon}}';
const KEY_TEXT = '{{text}}';
const KEY_HREF = '{{href}}';
const KEY_COLOR = '{{color}}';
const KEY_LINKS = '{{links}}';

const KEY_COLORS = ['group-icon-green', 'group-icon-orange', 'group-icon-red', 'group-icon-blue', 'group-icon-purple'];

// 左侧内容模版
const TEMPLATE_LEFT =
    `<a class="nav-container" href="#${KEY_HREF}">
        <p class="nav-icon"><img src="${KEY_ICON}"/></p>
        <p class="nav-text">${KEY_TEXT}</p>
    </a>
`;
// 右侧内容模版
const TEMPLATE_RIGHT =
    `<div class="group-container">
        <div class="group-title">
            <p id="${KEY_HREF}" class="group-icon ${KEY_COLOR}"><img src="${KEY_ICON}"/></p>
            <p class="group-text">${KEY_TEXT}</p>
        </div>
        <div class="link-container">
            ${KEY_LINKS}
        </div>
    </div>
`;
// 右侧 link 模版
const TEMPLATE_LINK =
    `<a class="link-item" href="${KEY_HREF}">
        <div class="link-item-container">
            <img src="${KEY_ICON}"/>
            <p>${KEY_TEXT}</p>
        </div>
    </a>
`;


//


/**
 * 根据传入的 url 地址，获取并返回页面的 <title>
 * @param {string} url
 * @return {Promise<string>}
 */
function getPageTitle(url) {
    return new Promise((resolve, reject) => {
        const options = {url: url, timeout: 2000};
        request.get(options, (err, response, body) => {
            if (err)
                return reject(err);

            const result = body.match(/<title.*?>(.*?)<\/title>/i);
            if (!result)
                reject("Pages Don't Have Title Tags!");
            else
                resolve(result[1]);
        });
    });
}


//


async function build() {
    // 加载配置文件
    const cfgFile = await fs.readFile(PATH_CFG, 'utf8');
    const config = YAML.parse(cfgFile);
    // 加载模版文件
    let template = await fs.readFile(PATH_HTML, 'utf8');
    template = template.replace(new RegExp(KEY_TITLE, 'g'), config.title);

    await fs.emptyDir(DIR_DEST_ICON);
    await fs.ensureDir(DIR_FAVINCON);
    const FAVICONS = await fs.readdir(DIR_FAVINCON);

    let leftStr = '';
    let rightStr = '';
    let linksStr;
    for (let i = 0; i < config.links.length; i++) {
        const group = config.links[i];
        const anchor = 'anchor' + i;
        for (const groupName of Object.keys(group)) {
            console.log('\n' + groupName);
            const links = group[groupName];
            let navIcon = null;
            linksStr = '';
            for (let j = 0; j < links.length; j++) {
                let link = links[j];
                for (let linkName of Object.keys(link)) {
                    let linkUrl = link[linkName];

                    // 只配置了 url
                    const onlyUrl = linkName === '0' && linkUrl.toLowerCase() === 'h';
                    if (onlyUrl) {
                        linkUrl = link;
                        try {
                            linkName = await getPageTitle(link);
                        } catch (err) {
                            break;
                        }
                    }

                    // 该项是配置 group icon
                    if (linkName === CFG_ICON)
                        navIcon = linkUrl;
                    else {
                        let iconPath
                        try {
                            const linkHostname = URL.parse(linkUrl).hostname;
                            iconPath = FAVICONS.find(item => {
                                return item.startsWith(linkHostname);
                            });

                            // favicon 还未获取
                            if (!iconPath)
                                iconPath = await getFavicon(linkUrl, DIR_FAVINCON);
                            iconPath = 'favicon/' + path.basename(iconPath);
                            console.log('  [✓] ' + linkUrl);
                        } catch (err) {
                            iconPath = ICO_NONE;
                            console.log('  [✕] ' + linkUrl);
                        }
                        linksStr += TEMPLATE_LINK
                            .replace(KEY_TEXT, linkName)
                            .replace(KEY_HREF, linkUrl)
                            .replace(KEY_ICON, iconPath);
                    }

                    if (onlyUrl) break;
                }
            }

            navIcon = navIcon ? 'icon/' + navIcon : ICO_MISSING;
            leftStr += TEMPLATE_LEFT
                .replace(KEY_HREF, anchor)
                .replace(KEY_TEXT, groupName)
                .replace(KEY_ICON, navIcon);
            rightStr += TEMPLATE_RIGHT
                .replace(KEY_HREF, anchor)
                .replace(KEY_TEXT, groupName)
                .replace(KEY_ICON, navIcon)
                .replace(KEY_COLOR, KEY_COLORS[Math.floor((Math.random() * KEY_COLORS.length))])
                .replace(KEY_LINKS, linksStr);
        }
    }

    // 压缩/生成 index.html
    template = template
        .replace(KEY_LEFT, leftStr)
        .replace(KEY_RIGHT, rightStr);
    template = htmlMinify.minify(template, {
        includeAutoGeneratedTags: true,
        removeAttributeQuotes: true,
        removeComments: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        sortClassName: true,
        useShortDoctype: true,
        collapseWhitespace: true
    });
    await fs.outputFile(DIR_DEST + 'index.html', template);

    // 压缩/生成 styles.css 文件
    let styles = await fs.readFile(PATH_STYLES, 'utf8');
    styles = new CleanCSS().minify(styles);
    await fs.outputFile(DIR_DEST + 'styles.css', styles.styles);

    // 拷贝 src/icon
    await fs.copy(DIR_SRC_ICON, DIR_DEST_ICON);
}


//


console.log('starting\n---');
build().then(() => console.log('\n---\nall complete!'));


// async function test() {
//     try {
//         await fs.ensureDir(DIR_FAVINCON);
//         const icoUrl = 'https://fakefish.github.io/react-webpack-cookbook/Introduction-to-Webpack.html';
//         const icoPath = await getFavicon(icoUrl, DIR_FAVINCON);
//         console.log('save path: ' + icoPath);
//     } catch (err) {
//         console.log('!!! ERROR !!!');
//         console.log(err);
//     }
// }
//
// test();

