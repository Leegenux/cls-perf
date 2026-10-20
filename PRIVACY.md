# 隐私政策 / Privacy Policy — 财联社减负 (CLS Perf)

最后更新：2026-10-20

## 我们不收集任何数据

本扩展**不收集、不存储、不上传、不出售、不共享**任何用户数据。没有分析 SDK，没有遥测，没有服务器，扩展本身不发起任何网络请求。

## 扩展做了什么

1. 在用户访问的 `*.cls.cn` / `*.cailianshe.com` 页面上注入少量 CSS 与 DOM 观察逻辑，用于降低长列表页面的重排开销。
2. 通过 `declarativeNetRequest` 静态规则阻止两个统计脚本（`cdnjs.cls.cn/www/*/js/baidu.js`、`||hm.baidu.com/`）。
3. 用 `chrome.storage.local` 在**用户本机**保存一个开关状态和计数（例如"已隔离元素数"）。这些数值不离开浏览器，卸载扩展即删除。

## 权限用途

| 权限 | 用途 |
|---|---|
| `host_permissions`（`*.cls.cn`、`*.cailianshe.com`） | 仅在这两个站点的页面注入内容脚本、应用拦截规则。不读取其他网站。 |
| `declarativeNetRequest` / `declarativeNetRequestWithHostAccess` | 阻止上述两个统计脚本。规则随扩展静态打包，不从网络下载。 |
| `storage` | 保存开关状态与本地计数。 |
| `scripting` | 开关切换后重新注入内容脚本使其立即生效。 |

## 不涉及的内容

- 不读取、不修改、不转存站点内容或账号信息
- 不使用远程代码（无 `eval`、无远程脚本、无动态 `import`）
- 不在扩展内展示广告或导流
- 不面向 13 岁以下儿童收集信息（因为不收集任何信息）

## 非官方声明

本扩展为个人开发的开源工具，与财联社（上海界面财联社科技股份有限公司 / 财联社网站及 App）**无任何关联、未获其授权或背书**。财联社名称仅用于说明本扩展适用的网站。

## 联系方式

GitHub Issue：<https://github.com/Leegenux/cls-perf/issues>

源码：<https://github.com/Leegenux/cls-perf>（MIT）
