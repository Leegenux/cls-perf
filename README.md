# 财联社减负 (CLS Perf)

一个 Chrome / Edge 扩展（Manifest V3），用来缓解[财联社](https://www.cls.cn/telegraph)快讯页"越用越卡、内存越吃越高"的问题。

纯前端优化，不修改、不劫持站点数据。

## 问题

财联社快讯页是**长列表 + 非虚拟化**渲染：每来一条新快讯就向 DOM 插入一个节点，触发整棵渲染树重排（layout）与重绘（paint）。

DOM 越大，单次插入代价越高 —— 表现为「页面开着越久越卡」，而不是打开时卡。

## 做法（三层）

| 层 | 机制 | 作用 |
|---|---|---|
| **L1 全局** | `content-visibility: auto` + `contain-intrinsic-size` | 屏外内容脱离 layout，滚动容器回归原生性能 |
| **L2 动态瞄准** | `MutationObserver` 识别"持续高频新增子节点"的容器 | 锁定快讯流容器后，给每条快讯独立 `contain: layout style paint`，抹掉「插一条整列重排」 |
| **L3 兜底** | DOM 项数 > 3000 时截断纯文本旧行 | 安全阀设得很高，正常使用不会触发 |

另外通过 `declarativeNetRequest` 拦截两个纯统计脚本：

- `cdnjs.cls.cn/www/*/js/baidu.js`
- `||hm.baidu.com/`

> 这两条只影响统计上报，不影响页面内容与功能。可在扩展弹窗里关闭。

## 安装（未上架应用商店，手动加载）

1. 下载本仓库（`Code` → `Download ZIP`，或 `git clone`）
2. 解压后把文件夹放到一个**固定位置**，例如 `~/Applications/cls-perf`
   > ⚠️ 不要留在「下载」目录。Chrome 加载的是这个文件夹本身，文件夹一旦移动或删除，扩展立即失效。
3. 打开 `chrome://extensions`
4. 打开右上角「开发者模式」
5. 点「加载已解压的扩展程序」，选中包含 `manifest.json` 的那一层文件夹
6. **关闭所有旧的财联社标签页**，重新打开 <https://www.cls.cn/telegraph>
   > 旧标签页仍挂着旧的内容脚本，不关掉会以为没生效。
7. 点工具栏图标可看到实时统计面板

## 权限说明

| 权限 | 用途 |
|---|---|
| `declarativeNetRequest` | 拦截上述两个统计脚本 |
| `storage` | 保存开关状态 |
| `scripting` | popup 读取当前标签页的统计对象 |
| `host_permissions` | 仅限 `*.cls.cn`、`*.cailianshe.com` |

扩展**不收集、不上传任何数据**，无网络请求，无远程代码。

## 已知限制

- 依赖站点 DOM 结构特征做动态识别，财联社改版后可能失效（失效时通常表现为面板数字不动）
- 只对 `cls.cn` / `cailianshe.com` 生效
- 非官方扩展，与财联社无任何关联
- 适用于 Chrome / Edge 等 Chromium 内核浏览器；Firefox 需少量改动

## 目录

```
manifest.json      MV3 清单
background.js      service worker：统计聚合、拦截规则开关
content.js         核心：L1/L2/L3 三层优化 + 统计对象 window.__CLS_PERF__
net_rules.json     静态拦截规则
popup.html/js      性能面板
icons/             图标
```

## License

MIT
