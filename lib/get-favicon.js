/**
 * Created by LOLO on 2021/11/4.
 */


const URL = require('url');
const path = require('path');
const fs = require('fs');
const request = require('request');


/**
 * 根据传入的 url 地址，下载 favicon 文件。
 * 如果 url 下的 favicon.ico 存在，将返回保存的本地路径。
 * 如果不存在，将在页面内容中查找 <link> "shortcut icon" or "icon" 标签。
 * 如果都不存在，将返回 reject(err)
 *
 * call getFavicon('google.com', 'myIcon')
 * return 'myIcon/google.com.ico'
 *
 * @param {string} url
 * @param {string} savedir
 * @return {Promise<string>}
 */
async function getFavicon(url, savedir) {
    const parsedUrl = URL.parse(url);
    const formatSavePath = (icourl) => {
        return path.normalize(`${savedir}/${parsedUrl.hostname}${path.extname(icourl).split('?')[0]}`);
    };

    url = 'https://www.google.com/s2/favicons?sz=64&domain=' + parsedUrl.hostname;
    return downloadFavicon(url, formatSavePath(url));
}


/*
async function getFavicon(url, savedir) {
    const parsedUrl = URL.parse(url);
    let icoUrl;

    const formatSavePath = (icourl) => {
        return path.normalize(`${savedir}/${parsedUrl.hostname}${path.extname(icourl).split('?')[0]}`);
    };

    // 网站根目录下 favicon.ico
    try {
        icoUrl = `${parsedUrl.protocol}//${parsedUrl.host}/favicon.ico`;
        const icoPath = await downloadFavicon(icoUrl, formatSavePath(icoUrl));
        return Promise.resolve(icoPath);
    } catch {
    }

    // 解析网页内容，是否有 'icon', 'shortcut icon' <link>标签
    return new Promise((resolve, reject) => {
        const options = {url: url, timeout: 2000};
        request.get(options, (err, response, body) => {
            if (err)
                return reject(err);

            let startIdx = body.indexOf('rel="shortcut icon"');
            if (startIdx === -1) startIdx = body.indexOf('rel="icon"');
            if (startIdx === -1)
                return reject("Pages Don't Have Icon Tags!");

            startIdx = body.lastIndexOf('<link', startIdx);// <link href="" rel="icon" />
            startIdx = body.indexOf('href="', startIdx);
            startIdx += 6;
            const endIdx = body.indexOf('"', startIdx);
            icoUrl = body.substring(startIdx, endIdx);

            if (icoUrl.startsWith('//'))// 协议未配置
                icoUrl = parsedUrl.protocol + icoUrl;
            if (icoUrl.startsWith('/'))// 网站绝对路径
                icoUrl = `${parsedUrl.protocol}//${parsedUrl.host}${icoUrl}`;

            // 网站相对路径
            let p_url = URL.parse(icoUrl);
            if (!p_url.protocol && !p_url.host) {
                let curUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}/${icoUrl}`;
                downloadFavicon(curUrl, formatSavePath(curUrl)).then(
                    v => resolve(v),
                    e => {
                        // url.pathname 可能会包含 '*.html 等情况
                        icoUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}/../${icoUrl}`;
                        downloadFavicon(icoUrl, formatSavePath(icoUrl)).then(
                            v => resolve(v),
                            e => reject(e)
                        );
                    }
                );

            } else
                downloadFavicon(icoUrl, formatSavePath(icoUrl)).then(
                    v => resolve(v),
                    e => reject(e)
                );
        });
    });
}


*/


/**
 * 根据传入的 icoUrl 地址，下载 favicon 文件。
 * 如果 favicon 存在，将返回保存的本地路径（参数：savePath）。
 * 如果不存在，将返回 reject(err)
 * @param {string} icoUrl
 * @param {string} savePath
 * @return {Promise<string>}
 */
function downloadFavicon(icoUrl, savePath) {
    // console.log(' > get icon: ' + icoUrl);
    return new Promise((resolve, reject) => {
        try {
            const options = {url: icoUrl, timeout: 2000};
            request.head(options, (err, response, body) => {

                if (err) return reject(err);

                const statusCode = response.statusCode;
                if (statusCode !== 200)
                    return reject('statusCode: ' + statusCode);

                const contentType = response.headers['content-type'];
                if (!contentType)
                    return reject('content-type: none');

                if (!contentType.startsWith('image/'))
                    return reject('content-type: ' + contentType);

                if (response.headers['content-length'] === '0')
                    return reject('content-length: 0');

                request
                    .get(icoUrl)
                    .pipe(fs.createWriteStream(savePath))
                    .on('error', (err) => {
                        return reject(err);
                    })
                    .on('finish', () => {
                        resolve(savePath);
                    });
            });
        } catch (err) {
            return reject(err);
        }
    });
}


module.exports.getFavicon = getFavicon;