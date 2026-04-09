// ==UserScript==
// @name         自動下單零股
// @namespace    https://github.com/roazhang/TdccAuto
// @version      2.0.0
// @description  輸入零股代號（支援換行、逗號、空格混合），自動依序下單至暫存。遇到失敗自動跳過並記錄。
// @author       roazhang
// @match        https://www.sinotrade.com.tw/inside/Batch_Order
// @icon         https://raw.githubusercontent.com/roazhang/TdccAuto/main/img/icon.png
// @grant        none
// @license      MIT
// @homepage     https://github.com/roazhang/TdccAuto
// ==/UserScript==

(function () {
    'use strict';

    /* ─────────────────────────────────────────────
       Constants & Selectors
    ───────────────────────────────────────────── */
    const SEL = {
        input:       '#app-container input',
        submit:      '#app-container button.midbtn.submit',
        dropdown:    '#ui-id-2',
        typeSelect:  '#app-container .stockItemContainer select',
        priceHigh:   '#app-container .stockItemContainer button.priceBtn.smallBtn.high',
    };

    const TIMING = {
        typeChar:      40,   // ms between each typed character
        afterType:    900,   // wait for autocomplete
        afterSelect:  400,
        afterPrice:   250,
        afterSubmit:  350,
        betweenItems: 500,
    };

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    /* ─────────────────────────────────────────────
       Parse input: newline / comma / space mixed
    ───────────────────────────────────────────── */
    const parseStockCodes = raw =>
        raw.split(/[\n,，\s\t]+/)
           .map(s => s.trim())
           .filter(s => /^\d{4,6}$/.test(s));

    /* ─────────────────────────────────────────────
       Inject Apple-style CSS
    ───────────────────────────────────────────── */
    const STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=SF+Pro+Display:wght@300;400;500;600&display=swap');

    #roa-panel * {
        box-sizing: border-box;
        font-family: -apple-system, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
    }

    #roa-panel {
        position: fixed;
        top: 80px;
        right: 24px;
        width: 300px;
        z-index: 99999;
        background: rgba(255,255,255,0.82);
        backdrop-filter: blur(28px) saturate(180%);
        -webkit-backdrop-filter: blur(28px) saturate(180%);
        border: 1px solid rgba(255,255,255,0.6);
        border-radius: 18px;
        box-shadow:
            0 2px 4px rgba(0,0,0,0.04),
            0 8px 24px rgba(0,0,0,0.10),
            0 24px 48px rgba(0,0,0,0.08);
        padding: 0;
        overflow: hidden;
        transition: box-shadow .3s ease;
        user-select: none;
    }
    #roa-panel:hover {
        box-shadow:
            0 2px 4px rgba(0,0,0,0.06),
            0 12px 32px rgba(0,0,0,0.14),
            0 32px 60px rgba(0,0,0,0.10);
    }

    /* ── Titlebar ── */
    #roa-titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px 13px;
        border-bottom: 1px solid rgba(0,0,0,0.06);
        cursor: move;
    }
    #roa-title-left {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    #roa-icon {
        width: 28px;
        height: 28px;
        border-radius: 7px;
        background: linear-gradient(145deg, #1c7afd, #0a56e0);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 1px 3px rgba(0,94,255,0.35);
        flex-shrink: 0;
    }
    #roa-icon svg { width:16px; height:16px; fill:white; }
    #roa-title-text {
        font-size: 14px;
        font-weight: 600;
        color: #1a1a1a;
        letter-spacing: -0.2px;
    }
    #roa-version {
        font-size: 10px;
        font-weight: 500;
        color: #8e8e93;
        background: rgba(0,0,0,0.055);
        padding: 2px 6px;
        border-radius: 20px;
        letter-spacing: 0;
    }

    /* ── Collapse toggle ── */
    #roa-toggle {
        width: 24px;
        height: 24px;
        border-radius: 6px;
        background: transparent;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background .15s;
        color: #8e8e93;
        padding: 0;
    }
    #roa-toggle:hover { background: rgba(0,0,0,0.07); color: #444; }
    #roa-toggle svg { width:14px; height:14px; transition: transform .25s ease; }
    #roa-panel.collapsed #roa-toggle svg { transform: rotate(180deg); }

    /* ── Body ── */
    #roa-body {
        padding: 14px 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 11px;
        transition: max-height .35s cubic-bezier(.4,0,.2,1), opacity .25s ease, padding .3s;
        max-height: 600px;
        overflow: hidden;
        opacity: 1;
    }
    #roa-panel.collapsed #roa-body {
        max-height: 0;
        opacity: 0;
        padding-top: 0;
        padding-bottom: 0;
    }

    /* ── Textarea ── */
    #roa-input {
        width: 100%;
        height: 140px;
        resize: vertical;
        border: 1.5px solid rgba(0,0,0,0.10);
        border-radius: 11px;
        padding: 10px 12px;
        font-size: 13px;
        font-weight: 400;
        color: #1a1a1a;
        background: rgba(255,255,255,0.7);
        outline: none;
        transition: border-color .2s, box-shadow .2s;
        line-height: 1.55;
        caret-color: #1c7afd;
    }
    #roa-input:focus {
        border-color: rgba(28,122,253,0.55);
        box-shadow: 0 0 0 3.5px rgba(28,122,253,0.12);
        background: rgba(255,255,255,0.9);
    }
    #roa-input::placeholder { color: #b0b0b8; }
    #roa-input:disabled { opacity: 0.45; cursor: not-allowed; }

    /* ── Preview pill ── */
    #roa-preview {
        font-size: 12px;
        color: #6e6e73;
        background: rgba(0,0,0,0.045);
        border-radius: 8px;
        padding: 7px 10px;
        line-height: 1.4;
        min-height: 32px;
        transition: background .2s;
    }
    #roa-preview.has-codes {
        background: rgba(28,122,253,0.07);
        color: #1558c8;
    }

    /* ── Progress ── */
    #roa-progress-wrap {
        display: none;
        flex-direction: column;
        gap: 5px;
    }
    #roa-progress-track {
        width: 100%;
        height: 5px;
        background: rgba(0,0,0,0.07);
        border-radius: 99px;
        overflow: hidden;
    }
    #roa-progress-fill {
        height: 100%;
        width: 0%;
        border-radius: 99px;
        background: linear-gradient(90deg, #1c7afd, #34aadc);
        transition: width .4s cubic-bezier(.4,0,.2,1);
    }
    #roa-progress-label {
        font-size: 11px;
        color: #8e8e93;
        display: flex;
        justify-content: space-between;
    }

    /* ── Status ── */
    #roa-status {
        font-size: 12.5px;
        font-weight: 500;
        color: #6e6e73;
        display: none;
        align-items: center;
        gap: 6px;
        letter-spacing: -0.1px;
    }
    #roa-status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #8e8e93;
        flex-shrink: 0;
        transition: background .3s;
    }
    #roa-status.running  #roa-status-dot { background: #1c7afd; animation: roa-pulse 1.2s infinite; }
    #roa-status.success  #roa-status-dot { background: #30d158; }
    #roa-status.warning  #roa-status-dot { background: #ff9f0a; }
    #roa-status.error    #roa-status-dot { background: #ff453a; }
    @keyframes roa-pulse {
        0%,100% { opacity:1; transform:scale(1); }
        50%      { opacity:.5; transform:scale(1.35); }
    }

    /* ── Failed list ── */
    #roa-failed {
        display: none;
        background: rgba(255,69,58,0.07);
        border: 1px solid rgba(255,69,58,0.2);
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 11.5px;
        color: #c0392b;
        line-height: 1.6;
    }
    #roa-failed-copy {
        display: inline-block;
        margin-top: 5px;
        font-size: 11px;
        color: #1c7afd;
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 2px;
    }

    /* ── Buttons ── */
    #roa-btn-row {
        display: flex;
        gap: 8px;
    }
    .roa-btn {
        flex: 1;
        height: 36px;
        border: none;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        letter-spacing: -0.1px;
        transition: transform .13s, box-shadow .13s, opacity .13s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
    }
    .roa-btn:active { transform: scale(0.96); }
    .roa-btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }

    #roa-btn-start {
        background: linear-gradient(175deg, #2385fe, #0a56e0);
        color: #fff;
        box-shadow: 0 1px 3px rgba(0,94,255,0.28), 0 4px 14px rgba(0,94,255,0.22);
    }
    #roa-btn-start:hover:not(:disabled) {
        box-shadow: 0 1px 4px rgba(0,94,255,0.32), 0 6px 18px rgba(0,94,255,0.28);
    }

    #roa-btn-stop {
        background: rgba(255,69,58,0.10);
        color: #ff453a;
        display: none;
    }
    #roa-btn-stop:hover { background: rgba(255,69,58,0.17); }

    #roa-btn-clear {
        background: rgba(0,0,0,0.055);
        color: #6e6e73;
        flex: 0 0 36px;
        padding: 0;
    }
    #roa-btn-clear:hover { background: rgba(0,0,0,0.09); color: #3a3a3c; }
    `;

    const styleEl = document.createElement('style');
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);

    /* ─────────────────────────────────────────────
       Build Panel HTML
    ───────────────────────────────────────────── */
    const panel = document.createElement('div');
    panel.id = 'roa-panel';
    panel.innerHTML = `
    <div id="roa-titlebar">
        <div id="roa-title-left">
            <div id="roa-icon">
                <svg viewBox="0 0 20 20"><path d="M10 2a8 8 0 1 1 0 16A8 8 0 0 1 10 2zm0 1.6a6.4 6.4 0 1 0 0 12.8A6.4 6.4 0 0 0 10 3.6zm.8 3.2v2.4H13a.8.8 0 0 1 0 1.6h-2.2v2.4a.8.8 0 0 1-1.6 0v-2.4H7a.8.8 0 1 1 0-1.6h2.2V6.8a.8.8 0 0 1 1.6 0z"/></svg>
            </div>
            <span id="roa-title-text">自動下單零股</span>
            <span id="roa-version">v2.0</span>
        </div>
        <button id="roa-toggle" title="收合">
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <polyline points="2,5 7,10 12,5"/>
            </svg>
        </button>
    </div>
    <div id="roa-body">
        <textarea id="roa-input" placeholder="輸入股票代號，支援換行、逗號、空白混合&#10;例：2330, 2317&#10;0050 006208 00878"></textarea>
        <div id="roa-preview">尚未輸入股票代號</div>

        <div id="roa-progress-wrap">
            <div id="roa-progress-track"><div id="roa-progress-fill"></div></div>
            <div id="roa-progress-label"><span id="roa-prog-text">0 / 0</span><span id="roa-prog-pct">0%</span></div>
        </div>

        <div id="roa-status"><div id="roa-status-dot"></div><span id="roa-status-msg">就緒</span></div>

        <div id="roa-failed">
            <strong>下單失敗代號：</strong><br>
            <span id="roa-failed-codes"></span><br>
            <span id="roa-failed-copy">點此複製，可重新貼回輸入框</span>
        </div>

        <div id="roa-btn-row">
            <button class="roa-btn" id="roa-btn-start">
                <svg width="13" height="13" viewBox="0 0 12 14" fill="currentColor"><path d="M1 1l10 6L1 13V1z"/></svg>
                開始下單
            </button>
            <button class="roa-btn" id="roa-btn-stop">
                <svg width="11" height="11" viewBox="0 0 10 10" fill="currentColor"><rect width="10" height="10" rx="2"/></svg>
                停止
            </button>
            <button class="roa-btn" id="roa-btn-clear" title="清空">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                    <line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/>
                </svg>
            </button>
        </div>
    </div>`;
    document.body.appendChild(panel);

    /* ─────────────────────────────────────────────
       Element refs
    ───────────────────────────────────────────── */
    const $ = id => document.getElementById(id);
    const input       = $('roa-input');
    const preview     = $('roa-preview');
    const progWrap    = $('roa-progress-wrap');
    const progFill    = $('roa-progress-fill');
    const progText    = $('roa-prog-text');
    const progPct     = $('roa-prog-pct');
    const statusBox   = $('roa-status');
    const statusMsg   = $('roa-status-msg');
    const failedBox   = $('roa-failed');
    const failedCodes = $('roa-failed-codes');
    const failedCopy  = $('roa-failed-copy');
    const btnStart    = $('roa-btn-start');
    const btnStop     = $('roa-btn-stop');
    const btnClear    = $('roa-btn-clear');
    const toggle      = $('roa-toggle');

    /* ─────────────────────────────────────────────
       UI helpers
    ───────────────────────────────────────────── */
    function setStatus(msg, state = '') {
        statusBox.style.display = 'flex';
        statusMsg.textContent = msg;
        statusBox.className = state;
    }
    function setProgress(done, total) {
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        progFill.style.width = pct + '%';
        progText.textContent = `${done} / ${total}`;
        progPct.textContent  = pct + '%';
        progWrap.style.display = 'flex';
    }
    function updatePreview() {
        const codes = parseStockCodes(input.value);
        if (codes.length > 0) {
            preview.textContent = `✓  辨識到 ${codes.length} 筆：${codes.join('  ')}`;
            preview.className = 'has-codes';
        } else {
            preview.textContent = '尚未輸入股票代號';
            preview.className = '';
        }
    }

    /* ─────────────────────────────────────────────
       Core: simulate typing into Vue/React input
    ───────────────────────────────────────────── */
    async function simulateTyping(el, text) {
        el.focus();
        // Set value via native input value setter (bypasses React/Vue's own setter)
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(30);

        for (const char of text) {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
            nativeSetter.call(el, el.value + char);
            el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: char }));
            el.dispatchEvent(new KeyboardEvent('keyup',   { key: char, bubbles: true }));
            await sleep(TIMING.typeChar);
        }
    }

    async function selectOptionByValue(sel, val) {
        const opt = Array.from(sel.options).find(o => o.value === val && o.style.display !== 'none');
        if (!opt) return false;
        // Native setter for React-controlled select
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        nativeSetter.call(sel, val);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    /* ─────────────────────────────────────────────
       Core: process one stock code
       Returns: 'ok' | 'skip' | 'abort'
    ───────────────────────────────────────────── */
    async function processOne(code) {
        const inputEl   = document.querySelector(SEL.input);
        const submitBtn = document.querySelector(SEL.submit);
        const dropdown  = document.querySelector(SEL.dropdown);
        const typeSelect= document.querySelector(SEL.typeSelect);
        const priceBtn  = document.querySelector(SEL.priceHigh);

        if (!inputEl || !submitBtn || !dropdown || !typeSelect || !priceBtn) {
            console.error('[ROA] 必要 DOM 元素遺失，中止');
            return 'abort';
        }

        await simulateTyping(inputEl, code);
        await sleep(TIMING.afterType);

        // Verify dropdown first item starts with the code
        const firstItem = dropdown.childNodes[0];
        if (!firstItem || !firstItem.innerText?.startsWith(code + ' ')) {
            console.warn(`[ROA] ${code} → 查無此代號，略過`);
            return 'skip';
        }

        console.info(`[ROA] ${code} → ${firstItem.innerText.trim()}`);
        firstItem.click();
        await sleep(TIMING.afterSelect);

        if (!(await selectOptionByValue(typeSelect, 'C'))) {
            console.warn(`[ROA] ${code} → 零股選項不可用，略過`);
            return 'skip';
        }

        await sleep(TIMING.afterSelect);
        priceBtn.click();
        await sleep(TIMING.afterPrice);
        submitBtn.click();
        await sleep(TIMING.afterSubmit);
        return 'ok';
    }

    /* ─────────────────────────────────────────────
       Main loop
    ───────────────────────────────────────────── */
    let running   = false;
    let stopFlag  = false;

    async function startAll() {
        const codes = parseStockCodes(input.value);
        if (codes.length === 0) {
            setStatus('請先輸入有效的股票代號', 'warning');
            return;
        }

        running = true;
        stopFlag = false;

        // UI: enter running state
        btnStart.style.display   = 'none';
        btnStop.style.display    = 'flex';
        btnClear.disabled        = true;
        input.disabled           = true;
        failedBox.style.display  = 'none';
        setProgress(0, codes.length);

        const failed = [];
        let done = 0;

        for (const code of codes) {
            if (stopFlag) {
                setStatus('已停止', 'warning');
                break;
            }

            setStatus(`正在處理 ${code}（${done + 1} / ${codes.length}）`, 'running');

            try {
                const result = await processOne(code);
                if (result === 'skip')  failed.push(code);
                if (result === 'abort') { failed.push(...codes.slice(done)); break; }
            } catch (e) {
                console.error(`[ROA] ${code} 發生例外：`, e);
                failed.push(code);
            }

            done++;
            setProgress(done, codes.length);
            if (!stopFlag) await sleep(TIMING.betweenItems);
        }

        // ── Final state ──
        const ok = codes.length - failed.length;
        if (!stopFlag) {
            setStatus(
                failed.length === 0
                    ? `全部完成，共 ${ok} 筆成功 ✓`
                    : `完成，${ok} 筆成功，${failed.length} 筆失敗`,
                failed.length === 0 ? 'success' : 'warning'
            );
        }

        if (failed.length > 0) {
            failedCodes.textContent = failed.join('  ');
            failedBox.style.display = 'block';
        }

        running = false;
        btnStart.style.display  = 'flex';
        btnStop.style.display   = 'none';
        btnClear.disabled       = false;
        input.disabled          = false;
    }

    /* ─────────────────────────────────────────────
       Event listeners
    ───────────────────────────────────────────── */
    input.addEventListener('input', updatePreview);

    btnStart.addEventListener('click', () => { if (!running) startAll(); });
    btnStop.addEventListener('click',  () => { stopFlag = true; });
    btnClear.addEventListener('click', () => {
        if (running) return;
        input.value = '';
        updatePreview();
        statusBox.style.display   = 'none';
        progWrap.style.display    = 'none';
        failedBox.style.display   = 'none';
    });

    failedCopy.addEventListener('click', () => {
        const text = failedCodes.textContent.trim().replace(/\s+/g, '\n');
        navigator.clipboard.writeText(text).then(() => {
            failedCopy.textContent = '已複製 ✓';
            setTimeout(() => { failedCopy.textContent = '點此複製，可重新貼回輸入框'; }, 2000);
        });
    });

    // Collapse / expand
    toggle.addEventListener('click', () => panel.classList.toggle('collapsed'));

    // Draggable titlebar
    const titlebar = $('roa-titlebar');
    let drag = null;
    titlebar.addEventListener('mousedown', e => {
        if (e.target.closest('#roa-toggle')) return;
        const r = panel.getBoundingClientRect();
        drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
        document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', e => {
        if (!drag) return;
        panel.style.right = 'auto';
        panel.style.left  = (e.clientX - drag.dx) + 'px';
        panel.style.top   = (e.clientY - drag.dy) + 'px';
    });
    document.addEventListener('mouseup', () => {
        drag = null;
        document.body.style.userSelect = '';
    });

})();
