// ==UserScript==
// @name         BiliFilter
// @namespace    https://example.com/
// @version      21                     // CHG
// @description  Filtering Bilibili danmaku via local LLM
// @author       dddng
// @match        https://www.bilibili.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        unsafeWindow
// @connect      127.0.0.1
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';
  /**************** CONFIG ****************/
  const BACKEND_ENDPOINT = 'http://127.0.0.1:1234/v1/chat/completions';
  const BATCH_SIZE = 10;
  const BATCH_TIMEOUT = 500; // ms
  const KEEP_CATEGORIES = new Set(['正常', '未分类']);  // CHG: 保留“未分类”
  const DEBUG = false;
  const SHOW_CATEGORY = false;                // true: show "弹幕 [分类]"
  const HIDE_BEFORE_RESPONSE = true;         // true: API 返回前隐藏弹幕
  const MAX_CONCURRENT_REQUESTS = 2;          // 并发上限
  const MAX_QUEUE_LENGTH = 0;                 // 仅限制排队长度（不含并发中的）

  const PROMPT_HEADER =
`按照类别分类弹幕：色情低俗，恶意刷屏，人身攻击，垃圾广告，引战，剧透，错误科普，正常
请直接输出分类结果，一行一个
视频标题：`;

  const CLASS_PAT = /^bili-danmaku-x-/;
  const log = (...a) => DEBUG && console.debug('[DanmakuFilter]', ...a);

  GM_addStyle(`.gpt-danmaku-hidden{${HIDE_BEFORE_RESPONSE ? 'visibility:hidden!important;' : ''}}`);

  const queue = [];                // 未打包弹幕
  const pendingBatches = [];       // 等待发送的批次
  let timer = null;
  let activeRequests = 0;          // 正在进行的请求数

  /* utils */
  const cleanTitle = t => t.replace(/[-—]\s*bilibili.*$/i, '').trim();

  /* enqueue */
  function enqueue(node, text) {
    if (HIDE_BEFORE_RESPONSE) node.classList.add('gpt-danmaku-hidden');
    queue.push({ node, text });
    if (queue.length >= BATCH_SIZE) flushQueue();
    else if (!timer) timer = setTimeout(flushQueue, BATCH_TIMEOUT);
  }

  function maybeQueue(el) {
    if (!(el instanceof HTMLElement)) return;
    if (!CLASS_PAT.test(el.className)) return;
    const txt = el.textContent.trim();
    if (!txt) return;
    if (/\[[^\]]+\]$/.test(txt)) return;
    if (el.__dmfLast === txt) return;
    el.__dmfLast = txt;
    enqueue(el, txt);
  }

  /***************  network  ***************/
  function flushQueue() {
    if (!queue.length) return;
    const batch = queue.splice(0, queue.length);
    clearTimeout(timer); timer = null;

    pendingBatches.push(batch);
    maybeSendNext();
  }

  /* 丢弃并标记“未分类” */
  function discardBatch(batch) {
    log(`队列溢出，丢弃批次（${batch.length} 条）→ 未分类`);
    batch.forEach(item => {
      const category = '未分类';
      if (SHOW_CATEGORY) {
        item.node.textContent = `${item.text} [${category}]`;
        item.node.__dmfLast = item.node.textContent;
        if (HIDE_BEFORE_RESPONSE) item.node.classList.remove('gpt-danmaku-hidden');
      } else {
        if (HIDE_BEFORE_RESPONSE) item.node.classList.remove('gpt-danmaku-hidden');
        /* KEEP_CATEGORIES 已含 “未分类”，故不隐藏 */
      }
    });
  }

  /* 检查排队长度，仅考虑 pendingBatches */
  function checkQueueOverflow() {
    while (pendingBatches.length > MAX_QUEUE_LENGTH) {
      const old = pendingBatches.shift();
      discardBatch(old);
    }
  }

  /* 发送尽可能多的批次，然后做溢出检查 */
  function maybeSendNext() {
    while (activeRequests < MAX_CONCURRENT_REQUESTS && pendingBatches.length) {
      const batch = pendingBatches.shift();
      sendBatchRequest(batch);
    }
    checkQueueOverflow();  // CHG: 发送后才判断队列是否超长
  }

  function sendBatchRequest(batch) {
    activeRequests++;

    const title = cleanTitle(document.querySelector('h1')?.innerText || document.title);
    const prompt = `${PROMPT_HEADER}${title}\n待分类弹幕：\n${batch.map(i => i.text).join('\n')}`;

    GM_xmlhttpRequest({
      method: 'POST',
      url: BACKEND_ENDPOINT,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        model: 'gemma3_4b_BiliFilter_v2',
        messages: [{ role: 'user', content: prompt }]
      }),
      onload: resp => {
        handleResponse(resp, batch);
        activeRequests--;
        maybeSendNext();           // 继续调度
      },
      onerror: err => {
        console.error('[DanmakuFilter] request error', err);
        discardBatch(batch);       // 失败视作未分类
        activeRequests--;
        maybeSendNext();
      }
    });
  }

  function handleResponse(resp, batch) {
    let txt;
    try {
      const j = JSON.parse(resp.responseText || '{}');
      txt = j.choices?.[0]?.message?.content || j.response || j.text || '';
    } catch { txt = resp.responseText; }

    let lines = txt.trim().split(/\r?\n/);
    if (lines.length < batch.length)
      lines = lines.concat(Array(batch.length - lines.length).fill('未分类'));

    log('弹幕分类结果:\n' + lines.map((c, i) =>
      `${batch[i]?.text || '(missing)'} —> ${c}`).join('\n'));

    lines.forEach((cat, i) => {
      const item = batch[i]; if (!item) return;
      const category = cat.trim();
      if (SHOW_CATEGORY) {
        item.node.textContent = `${item.text} [${category}]`;
        item.node.__dmfLast = item.node.textContent;
        if (HIDE_BEFORE_RESPONSE) item.node.classList.remove('gpt-danmaku-hidden');
      } else {
        if (!KEEP_CATEGORIES.has(category)) {
          item.node.style.display = 'none';
        } else if (HIDE_BEFORE_RESPONSE) {
          item.node.classList.remove('gpt-danmaku-hidden');
        }
      }
    });
  }

  /***************  observer  ***************/
  function attach(root) {
    const mo = new MutationObserver(ms => {
      ms.forEach(m => {
        if (m.type === 'childList') m.addedNodes.forEach(maybeQueue);
        if (m.type === 'characterData') maybeQueue(m.target.parentElement);
        if (m.type === 'attributes') maybeQueue(m.target);
        m.addedNodes.forEach(n => {
          if (n.shadowRoot) attach(n.shadowRoot);
          if (n.tagName === 'IFRAME') {
            try { const d = n.contentDocument; if (d) attach(d); } catch { }
          }
        });
      });
    });
    mo.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
    deepScan(root);
  }

  function deepScan(node) {
    maybeQueue(node);
    node.childNodes.forEach(c => { if (c instanceof HTMLElement) deepScan(c); });
    if (node.shadowRoot) attach(node.shadowRoot);
    if (node.tagName === 'IFRAME') {
      try { const d = node.contentDocument; if (d) attach(d); } catch { }
    }
  }

  attach(document);

  /* polling safety net */
  setInterval(() => {
    document.querySelectorAll('*').forEach(el => {
      if (CLASS_PAT.test(el.className)) maybeQueue(el);
      if (el.shadowRoot) el.shadowRoot.querySelectorAll('*').forEach(maybeQueue);
    });
  }, 1000);

  /* debug api */
  unsafeWindow.dmfAddDanmaku = (txt = '调试弹幕') => {
    const d = document.createElement('div');
    d.className = 'bili-danmaku-x-dm';
    d.textContent = txt;
    document.body.appendChild(d);
  };
  unsafeWindow.dmfFlush = () => flushQueue();
})();
