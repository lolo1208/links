# links

基于 YAML 配置生成的静态书签导航页。编辑链接列表后运行构建，即可将生成的静态文件部署到任意静态网站托管服务。

## 功能

- 按分组展示链接，并为分组指定图标。
- 自动获取链接 favicon；只填写 URL 时自动获取页面标题。
- 缓存已下载的 favicon、页面标题和近期失败记录，减少重复请求。
- 构建时压缩 HTML 和 CSS，生成可直接部署的静态文件。

## 环境要求

- Node.js 18 或更高版本。
- pnpm 或 npm。项目提供 `pnpm-lock.yaml`，推荐使用 pnpm 安装。
- 构建时需要网络访问以获取页面标题和 favicon；获取失败时会使用 URL 或默认图标。

## 快速开始

```bash
git clone https://github.com/lolo1208/links.git
cd links
pnpm install

# 编辑 config.yml 后构建
npm run build
```

在浏览器中打开 `dist/index.html` 预览；部署时上传整个 `dist/` 目录，包含 `icons/` 和 `favicons/`。

## 配置链接

在 `config.yml` 中设置站点标题和分组：

```yaml
title: 我的导航

links:
  - 搜索与社区:
      - ICON: search.svg
      - 有道词典: https://dict.youdao.com
      - V2EX: https://www.v2ex.com
      - https://flukeout.github.io/
```

- `title` 为空或未设置时默认为 `LINKS`；`links` 必须是包含至少一个分组的数组。
- 每个分组的值是链接数组；使用 `名称: URL` 指定名称，或只填写 URL 以在构建时获取页面标题。标题获取失败时显示 URL。
- `ICON`（也可写为 `icon`）指定 `src/icons/` 下的分组图标文件；未指定时使用 `missing.svg`。
- 链接只支持 `http` 和 `https`。配置无效时构建会报错并给出位置。

页面结构、样式和分组图标分别位于 `src/template.html`、`src/styles.css` 和 `src/icons/`。

## 构建命令

| 命令 | 说明 |
| --- | --- |
| `npm run build` | 构建到 `dist/`，复用现有缓存 |
| `npm run build:verbose` | 构建并输出缓存命中、抓取失败等调试信息 |
| `npm run build:fresh` | 先清理 `dist/` 和 `.cache/`，再构建 |
| `npm run clean` | 清理 `dist/` 和 `.cache/` |
| `npm run rebuild` | 执行清理并重新构建 |

也可以直接运行 `node lib/build.js --help` 查看选项：`--verbose`（或 `-v`）输出调试信息，`--clean` 在构建前清理，`--refresh` 忽略 favicon 失败记录并重试；`--help`（或 `-h`）显示帮助。`--refresh` 不会清除已下载的图标或页面标题缓存。

## 缓存与网络

- favicon 默认依次尝试 Google favicon 服务、站点根目录的 `favicon.ico` 和页面声明的图标；成功结果保存在 `dist/favicons/`，后续构建可复用。获取失败时使用 `src/icons/none.svg`。
- favicon 失败记录保存在 `.cache/favicon-failures.json`，默认保留 7 天；公共图标服务连续失败时会在本次构建中停用。
- 自动获取的页面标题保存在 `.cache/page-titles.json`。若需重新获取标题，可清理缓存后构建；清理也会删除已下载的 favicon。

## 验证

运行 `npm test` 执行离线回归测试，覆盖配置校验、模板转义、图标回退、并发限制与 HTTP 响应体超时及大小限制。构建抓取的响应体默认最多 5 MiB，避免异常站点消耗过多内存。

`ICON` 必须独占一个数组项，且只能填写图标文件名，不能包含目录或查询参数。

## 项目结构

```text
config.yml         站点标题与链接配置
src/
  template.html    页面模板
  styles.css       页面样式
  favicon.ico      网站图标
  icons/           分组及默认图标
lib/               构建、配置解析、资源处理与网络请求模块
  build.js         构建命令入口
  clean.js         清理命令入口
  index.js         构建 API 入口
dist/              生成的静态站点（不提交）
.cache/            本地构建缓存（不提交）
```

## 预览

![导航页面预览](https://static.lolo.link/img/screenshots/lolo.link.jpg)

## 许可证

[MIT](LICENSE)
