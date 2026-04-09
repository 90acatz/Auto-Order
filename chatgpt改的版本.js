// =============================
// v2.2 穩定版（Tampermonkey）
// 改進：
// - 移除 sleep 改用 observer
// - 加入 retry 機制
// - selector 強化
// =============================

// ==UserScript==
// @name         CHATPOT自動下單零股 v2.2 穩定版
// @match        https://www.sinotrade.com.tw/inside/Batch_Order
// @grant        none
// ==/UserScript==

(function () {
'use strict';

const waitForElement = (selector, timeout = 5000) => {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject('Element not found: ' + selector);
    }, timeout);
  });
};

const retry = async (fn, times = 3) => {
  for (let i = 0; i < times; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === times - 1) throw e;
    }
  }
};

async function processOne(code) {
  const input = await waitForElement('#app-container input');

  input.value = code;
  input.dispatchEvent(new Event('input', { bubbles: true }));

  const dropdown = await waitForElement('#ui-id-2 li');

  dropdown.click();

  const submit = await waitForElement('button.midbtn.submit');

  submit.click();

  return 'ok';
}

async function run(codes) {
  for (const code of codes) {
    await retry(() => processOne(code), 3);
  }
}

// 測試入口
window.runAutoOrder = run;

})();

