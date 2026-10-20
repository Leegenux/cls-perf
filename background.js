/**
 * 财联社减负 background service worker (MV3)
 * - 聚合各 tab 的性能统计，供 popup 查询
 * - 提供净网拦截规则总开关（可选，不影响默认配置）
 */

// 若用户开/关"拦截追踪脚本"，这里切换 declarativeNetRequest 规则(静态 id 1,2) 启用态。
// 默认全部启用（声明即启），此开关供 popup 随时整组关掉。
async function setTrackerBlocking(enabled) {
  try {
    const sessionId = 9001;
    // 用 session 规则覆盖静态规则更利于即时启停：
    // 但静态规则(声明文件)本就默认生效，这里改用 session 实现"关闭"——麻烦，
    // 简化：只要开启就改 session，关闭就清 session。
    const s = await chrome.declarativeNetRequest.getSessionRules();
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: s.map(r => r.id)
    });
    if (enabled) {
      await chrome.declarativeNetRequest.updateSessionRules({
        addRules: [
          {
            id: sessionId,
            priority: 2,
            action: { type: "block" },
            condition: {
              initiatorDomains: ["cls.cn", "www.cls.cn"],
              urlFilter: "||hm.baidu.com/",
              resourceTypes: ["script", "xmlhttprequest", "image"]
            }
          }
        ]
      });
    }
  } catch (e) { console.warn("[CLS-perf] setTrackerBlocking:", e); }
}

// 查询某 tab 的统计
async function getTabStats(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (window.__CLS_PERF__ || null)
    });
    return result;
  } catch (e) { return null; }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  switch (msg.type) {
    case 'CLS_TOGGLE_TRACKER':
      setTrackerBlocking(msg.enabled).then(() => sendResponse({ ok: true }));
      return true;
    case 'CLS_PING':
      sendResponse({ ok: true, ts: Date.now() });
      return false;
  }
});

// content script 端每次主动上报可存到 sessionStorage or storage.local 供 popup 读取；
// 但为省 IO，改为 popup 打开时调用 getTabStats 主动抓取（见 popup.js）。
void getTabStats;
