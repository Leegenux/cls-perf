/**
 * 财联社减负 - content script
 *
 * 根因诊断结果(fast): 财联社快讯流"每来一条新快讯→整页卡一下，历史列表越长越明显" = 长列表非虚拟化 +
 * 每次 insert 新节点触发整棵大树重排(layout)/重绘。DOM 越大，单次新增代价越高 → 呈"越用越卡"。
 *
 * 对策（分两层，纯前端、不动页面网络数据）：
 *  L1(通用安全): 给文档打全局 CSS：滚动容器与条目 content-visibility:auto → 屏外项脱离 layout，
 *                新项插入重排范围被限制；长列表滚动回归原生。
 *  L2(动态瞄准): MutationObserver 监视文档树，识别"持续高频新增子节点"的容器(快讯流特征)，
 *                锁定其 class 后用 CSS 规则把 *每条新闻条目* 独立隔离渲染(contain:layout|style paint
 *                + content-visibility)，从根上抹掉"插一条整列重排"。
 *  L3: 兜底 —— 对极端增长(>3000项)的容器做 DOM 上限截断(仅删纯文本旧行，安全阀极高)。
 */

(() => {
  if (window.__clsPerfLoaded) return;
  window.__clsPerfLoaded = true;

  const HOST = new URL(location.href).hostname;
  const MUT_OBS = typeof MutationObserver !== 'undefined';

  // ============ 可观测统计(供 popup) ============
  const stats = {
    host: HOST, collectedAt: Date.now(),
    domNodes: 0, layerApplied: 0, containedSelectors: 0,
    trimmedNodes: 0, lockedContainerFound: false,
    lockedContainerCount: 0, maxFeedKids: 0,   // 持续认领模型观测
  };
  window.__CLS_PERF__ = stats;

  const $id = 'cls-perf-css-v1';
  // ===== 自证版本标记 =====
  // 磁盘当前改版在此盖戳。任何页面读到根节点 data-cls-ver 若等于下面这个值，
  // 铁证这一份 content.js 真的被 Chrome 注入执行（区分"代码没改对"与"Chrome 没重读盘"）。
  // CM 版本戳: 让它在正文出现一次便于 grep 定位。
  const VER = 'v2.4-' + '20260906-relock-fix-DISK-CM';
  // 上面 VER 值即"磁盘权威版本"，改代码时顺手更新日期戳即可。

  function appendStyle(css) {
    let el = document.getElementById($id);
    if (!el) {
      el = document.createElement('style');
      el.id = $id;
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent += '\n' + css;
  }

  // ---------- L1 全局层(写进 content sheet) ----------
  const L1 = `
    /* 让所有滚动/信息流容器进入"可视性优化"，屏外项停止参与渲染与布局 */
    .cls-perf-iso-all { content-visibility: auto; contain-intrinsic-size: auto 120px; }
  `;
  appendStyle(L1);

  // 动态瞄一条规则：对"流类容器"容器本身 + 直接子项启隔离。容器 id 会由 L2 给出。
  const containerRules = new Set();

  function lockContainerRule(selector) {
    if (containerRules.has(selector)) return;
    containerRules.add(selector);
    // 对容器直接子元素逐个隔离（快讯条目通常是 container > article/span/li？无统一标签，
    // 用 * 但指明仅直接子代的直系层级由 content-visibility 作用于整块 → 用通配后代但加 contain 兜底）
    appendStyle(`
      ${selector} { contain: layout style paint; }
      ${selector} > * { content-visibility: auto; contain-intrinsic-size: auto 160px; }
    `);
    stats.containedSelectors++;
    stats.lockedContainerFound = true;
  }

  // ---------- L2 动态发现增长流容器 ----------
  // 识别启发式：某容器在较短窗口内新增子节点次数高 → 快讯流。我们 track "每个候选容器最近新增数/时间"
  const growth = new Map(); // container -> {count, window}
  const SAMPLE_WIN = 6000, SAMPLE_MIN = 8;

  function recordGrowth(container) {
    const now = Date.now();
    let g = growth.get(container);
    if (!g) { g = { count: 0, last: now }; growth.set(container, g); }
    g.count++;
    g.last = now;
    // 触发识别
    if (g.count >= SAMPLE_MIN && !container.__clsLocked) {
      // 二次确认这是"持续新增"而非一次性挂载：观察期够长
      if (Date.now() - g._start > 2500 || g.count > 40) {
        container.__clsLocked = true;
        try {
          // 生成唯一且安全的 selector
          if (container.id) lockContainerRule('#' + CSS.escape(container.id));
          else if (container.className && typeof container.className === 'string') {
            const cls = container.className.split(/\s+/).filter(Boolean).slice(0,3).map(c=>CSS.escape(c)).join('.');
            if (cls) lockContainerRule('.' + cls);
          }
        } catch (e) {}
      } else if (!g._start) g._start = Date.now();
    }
  }

  function startObserver() {
    if (!MUT_OBS) return;
    let timer = null;
    const mo = new MutationObserver((mutations) => {
      let anyAdd = false;
      for (const m of mutations) {
        if (m.type !== 'childList' || !m.addedNodes.length) continue;
        anyAdd = true;
        // 沿着新增节点的父链路往上找几个层级，记录"发生新增的容器"
        let t = m.target;
        if (!(t instanceof Element)) continue;
        for (let d = 0; d < 4 && t && t !== document.body; d++, t = t.parentElement) {
          recordGrowth(t);
        }
      }
      // L3 兜底截断(低频、高阈值)放这里触发
      if (anyAdd) {
        clearTimeout(timer);
        timer = setTimeout(trimOversize, 4000);
        // 真实根治：财联社电报列表是异步分批 lazy-fill(首屏几条 → 几秒后几百条)。
        // 首屏(document_idle)只跑了一次 applyIsolation，此时列表还没灌满。
        // 因此只要 DOM 新增过(说明列表在长)，就防抖重扫 applyIsolation，持续补锁更大的容器。
        doScheduleRelock();   // 统一走节流重扫(1200ms)，锁定增长中的主 feed
      }
    });
    try { mo.observe(document.documentElement, { childList:true, subtree:true }); } catch(e){}
  }

  // ---------- L3 兜底：仅在确认的"增长容器"且极端超限才截断 DOM ----------
  const HARD_MAX = 4000;   // 条目数绝对上限（极高，正常不会触达）
  function trimOversize() {
    for (const container of growth.keys()) {
      const kids = container.children;
      if (!kids || kids.length < HARD_MAX) continue;
      // 保留最前 RETAIN 条更稳：快讯旧的在上、新的在下，删除尾部=丢掉新资讯；故删"中段"不现实。
      // 实际操作：财联社新消息追加到底部/顶部不定。安全做法——只删文本节点外、且为纯展示的前部过多项：
      const over = kids.length - 3500;
      if (over > 10) {
        try {
          for (let i = 0; i < over; i += 1) {
            const k = kids[i];
            // 仅当不是带交互/链接的最后几个保留下才删——保守：最多删到剩 3500 条，不动首条(可能是置顶)
            if (k && !k.querySelector('input,button,iframe,video')) k.remove();
            else break;
          }
          stats.trimmedNodes += over;
        } catch (e) {}
      }
      break;
    }
  }

  // 生成安全 selector（防止 class 含特殊字符崩溃）
  function safeSel(el, maxCls=3) {
    try {
      if (el.id) return '#' + CSS.escape(el.id);
      if (el.className && typeof el.className === 'string') {
        const c = el.className.split(/\s+/).filter(Boolean).slice(0, maxCls).map(x=>CSS.escape(x)).join('.');
        return c ? '.' + c : null;
      }
    } catch(e) {}
    return null;
  }

  // L2 亦可对"新增即重排"最典型的电报流做一次立即预瞄，避免首屏等待过久。
  // 核心策略(class无关)：遍历整棵 DOM，凡"直系子元素数 >= CONST_LOW" 的容器都可能是
  // 长列表(快讯/资讯 feed)。给它锁 contain 并对其直系子项 content-visibility。
  // 先少量扫描找"最大子数容器"，锁定后再以它为锚做隔离 → 避免对每个元素套昂贵 CSS。
  const CV_LOW = 25;      // 达到此子元素数即视为列表容器(单屏内会看到 ~15-20 条目)
  const APPEND_LIMIT = 60; // 顶部保险：最多给 60 个容器套规则，防失控

  const LOCK_ATTR = 'data-cls-perf-lock';

  // 持续认领模型：record of actually-locked live containers (identity, not flag),
  // 使"首次锁了个小容器"不阻止"之后长出来的更大主 feed 被追加锁定"。
  const lockedSet = new Set();          // 已打标的 Element
  let relockTimer = null;
  const RELOCK_DEBOUNCE = 1200;         // ms —— 扫描节流，防每次 mutation 全量扫

  function doScheduleRelock() {
    if (relockTimer) return;
    relockTimer = setTimeout(() => {
      relockTimer = null;
      try { applyIsolation(); } catch (e) {}
    }, RELOCK_DEBOUNCE);
  }

  function lockBigList(el) {
    if (!el || !(el instanceof Element)) return;
    if (lockedSet.has(el)) return;
    if (el.hasAttribute(LOCK_ATTR)) { lockedSet.add(el); return; }  // 已打标则只登记
    lockedSet.add(el);
    try { el.setAttribute(LOCK_ATTR, 'p'); } catch (e) {}
    // 对锁定容器锁 layout/style，并对其每个直系子项(content 元素)启用 content-visibility
    appendStyle(`[${LOCK_ATTR}="p"] { contain: layout style; }`);
    appendStyle(`[${LOCK_ATTR}="p"] > * { content-visibility: auto; contain-intrinsic-size: auto 140px; }`);
    stats.lockedContainerFound = true;
    stats.containedSelectors++;
    stats.lockedContainerCount = lockedSet.size;
    // 记录新观察到的最大 feed 规模（供 popup/诊断）
    const k = el.children ? el.children.length : 0;
    if (!stats.maxFeedKids || k > stats.maxFeedKids) stats.maxFeedKids = k;
    // 触发一次节流重扫，以便发现后续出现的更大容器
    doScheduleRelock();
  }

  // 全文档扫描 childElementCount 达标容器(列表特征)，class 无关
  const isContentList = (el) => {
    if (!el || !el.children) return false;
    const k = el.children.length;
    if (k < CV_LOW) return false;
    const tag = el.tagName;
    if (tag === 'HEAD' || tag === 'BODY' || tag === 'HTML') return false;
    if (tag === 'SCRIPT' || tag === 'STYLE') return false;
    return true;
  };

  // 锁定"骨架类"容器用启发式精简：骨架常是 DIV 且要么无 tag、要么在 APPEND 限制内，
  // 保险起见锁定极少数最大的即可；真正的 feed 会随 lazy-fill 长到最大，从而被持续补锁。
  const SKIP_SKEL = /^(nav|header|footer|aside|#app|\.ant-|\.modal)/i;
  function isSkeletonLike(el) {
    const cls = (el.className && typeof el.className === 'string') ? el.className : '';
    const id = el.id || '';
    if (SKIP_SKEL.test(cls) || SKIP_SKEL.test('#' + id)) return true;
    // 只有 1~2 个不同类型子项的布局容器不算 feed；feed 子项 class 高度重复
    if (el.children.length <= 40) {
      const kids = [...el.children];
      let diff = 0; const seen = new Set();
      for (const c of kids) { const name = (c.className && typeof c.className === 'string') ? c.className.split(' ')[0] : c.tagName; if (!seen.has(name)) { seen.add(name); diff++; } }
      if (diff >= Math.min(6, kids.length)) return true;  // 子项标签多样 → 布局而非列表
    }
    return false;
  }

  function applyIsolation() {
    // ★ 不再用一次性 __clsLockDone 挡死 —— 移除"锁了一次就永不再扫"。
    // 每次扫描找出当前所有达到规模的候选，选到的最大的多个未锁容器补锁。
    // 但为防全表扫过频(几百条时 querySelectorAll('*') 较贵)，只在确有长列表增长时被调用，
    // 且配合 lazy-fill 追加 + lockBigList 内部自触发 relock。
    const candidates = [];
    try {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if (isContentList(el) && !isSkeletonLike(el) && !el.hasAttribute(LOCK_ATTR)) {
          candidates.push(el);
          if (candidates.length >= APPEND_LIMIT) break;
        }
      }
    } catch (e) {}
    if (!candidates.length) {
      // 页面可能还没填满；稍后由 mutation/追加自然触发重扫，这里不再自递归。
      return;
    }
    // 只补锁规模最大的几个（真实主 feed 通常是最大的）
    candidates.sort((a, b) => (b.children ? b.children.length : 0) - (a.children ? a.children.length : 0));
    candidates.slice(0, 8).forEach(el => lockBigList(el));
    // 已锁最大容器规模 >= CV_LOW*8 时，基本可判定主列表已覆盖；无须特意停机 ——
    // 后续若有更大容器出现会被追加认领。保留节流上限即可。
  }

  function preLock() {
    try { applyIsolation(); } catch (e) {}
    // 兜底：role/live 容器(不依赖财联社 class 名)
    try {
      const probe = document.querySelectorAll('[role="feed"],[role="list"]');
      probe.forEach(el => { if (el.children && el.children.length > 5) { try { lockBigList(el); } catch (e) {} } });
    } catch (e) {}
  }


  function refreshDomCount() {
    stats.domNodes = document.getElementsByTagName('*').length;
  }

  // 消息
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
      if (msg?.type === 'CLS_GET_STATS') {
        refreshDomCount();
        sendResponse({ ...stats, childProp: stats.domNodes });
        return true;
      }
      if (msg?.type === 'CLS_REENABLE') {
        startObserver(); preLock(); sendResponse({ ok:true }); return false;
      }
    });
  }

  // 启动序列
  refreshDomCount();
  try { preLock(); } catch (e) {}
  try { startObserver(); } catch (e) {}

  // 生命周期成功标记（写共享 DOM，供外部诊断确凿判定 content script 已执行）
  try { document.documentElement.setAttribute('data-cls-perf','active'); } catch(e){}
  // 自证版本：与 VER 比对即知 Chrome 注入的是不是磁盘这份
  try { document.documentElement.setAttribute('data-cls-ver', VER); } catch(e){}

  // 周期性刷新统计低频(每 10s)，供 popup；节点全量数不频繁取(贵)。
  setInterval(refreshDomCount, 10000);
  // 顶层兜底：任何未捕获异常也标到 DOM 便于排查注入失败 vs 运行 crash
  window.addEventListener?.('error', (ev) => {
    try {
      const msg = ev && ev.message ? String(ev.message).slice(0,120) : 'unknown';
      const prev = document.documentElement.getAttribute('data-cls-err') || '';
      document.documentElement.setAttribute('data-cls-err', (prev ? prev + ' ; ' : '') + msg.slice(0,80));
    } catch(e){}
  }, true);
})();
