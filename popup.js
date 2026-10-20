/** popup logic */
const $ = id => document.getElementById(id);
const tabNow = $('tabNow');

function fmt(n){ return (typeof n==='number' && isFinite(n)) ? n.toLocaleString() : '—'; }

async function currentTab() {
  const [t] = await chrome.tabs.query({ active:true, currentWindow:true });
  return t;
}

async function init() {
  const t = await currentTab();
  if (!t || !/cls\.cn|cailianshe\.com/.test(t.url||'')) {
    $('host').textContent = '非财联社页';
    $('hint').textContent = '请打开财联社网页后再点此图标。';
    $('status').textContent = '';
    return;
  }
  $('host').textContent = new URL(t.url).hostname.replace('www.','');
  $('tabNow').textContent = fmt(t.id);

  // 从 content script 取实时统计
  try {
    const resp = await chrome.tabs.sendMessage(t.id, { type:'CLS_GET_STATS' });
    $('dom').textContent = fmt(resp.domNodes);
    $('cv').textContent = resp.contentVisApplied ? '已启用' : '（未匹配长列表）';
    $('rm').textContent = fmt(resp.removedItems);
    $('status').textContent = '已连接当前页面 ✓';
  } catch (e) {
    $('dom').textContent = '—';
    $('cv').textContent = '—';
    $('rm').textContent = '—';
    $('status').textContent = '页面已存在，重新加载一次即可启用优化。';
  }

  // 追踪开关状态（读 storage）
  const { trackerOn } = await chrome.storage.local.get({ trackerOn:true });
  $('tracker').checked = !!trackerOn;
  $('tracker').addEventListener('change', async ev => {
    const on = ev.target.checked;
    await chrome.storage.local.set({ trackerOn:on });
    await chrome.runtime.sendMessage({ type:'CLS_TOGGLE_TRACKER', enabled:on });
  });
}

init();
