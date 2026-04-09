// ==UserScript==
// @name         自動下單零股 3.0
// @namespace    https://github.com/roazhang/TdccAuto
// @version      3.0.0
// @description  永豐金證券零股自動下單腳本，提供高安全性的下單前驗證、精確股票匹配機制與高效的鍵盤擬真模擬。
// @author       roazhang & Gemini & Claude Opus 4.6
// @match        https://www.sinotrade.com.tw/inside/Batch_Order
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // ==============================================
    // [修復 #1] Selector 策略：提供 fallback 機制
    // #ui-id-2 是 jQuery UI 自動生成的，極不穩定
    // ==============================================
    const S = {
        in: '#app-container input[type="text"], #app-container input:not([type])',
        ok: '#app-container button.midbtn.submit',
        dd: null, // 動態偵測，見 findDropdown()
        sel: '#app-container .stockItemContainer select',
        hi: '#app-container .stockItemContainer button.priceBtn.smallBtn.high'
    };

    /**
     * 動態尋找下拉選單，不再硬編碼 #ui-id-2
     * 優先找 #ui-id-2，找不到則嘗試 .ui-autocomplete 等常見 jQuery UI 結構
     */
    function findDropdown() {
        return document.querySelector('#ui-id-2')
            || document.querySelector('.ui-autocomplete[role="listbox"]')
            || document.querySelector('ul.ui-autocomplete');
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const parse = s => s.split(/[\n,，\s]+/).map(v => v.trim()).filter(v => /^\d{4,6}$/.test(v));

    // ==============================================
    // [修復 #2] 原型鏈防護：驗證 native setter 的完整性
    // ==============================================
    function getNativeSetter(proto, prop) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
        if (!descriptor || typeof descriptor.set !== 'function') {
            throw new Error(`[Claude Opus] 安全警告：${proto.constructor.name}.${prop} 的原生 setter 已被篡改或不存在！`);
        }
        return descriptor.set;
    }

    // 啟動時預先取得並驗證，避免每次呼叫時重複取
    let inputNativeSetter, selectNativeSetter;
    try {
        inputNativeSetter = getNativeSetter(window.HTMLInputElement.prototype, 'value');
        selectNativeSetter = getNativeSetter(window.HTMLSelectElement.prototype, 'value');
    } catch (e) {
        console.error(e.message);
        alert(e.message);
        return; // 終止腳本，拒絕在不安全的環境中執行
    }

    // ==============================================
    // 鍵盤模擬核心（保留 2.0 的嚴謹事件序列）
    // ==============================================
    async function simulateTyping(el, text) {
        el.focus();
        inputNativeSetter.call(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(30);

        for (const char of text) {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
            inputNativeSetter.call(el, el.value + char);
            el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: char }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
            await sleep(40);
        }
    }

    async function selectOptionByValue(sel, val) {
        const opt = Array.from(sel.options).find(o => o.value === val && o.style.display !== 'none');
        if (!opt) return false;
        selectNativeSetter.call(sel, val);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    // ==============================================
    // [修復 #4] 精確股票匹配：遍歷所有 children
    // 原版只看 childNodes[0]，可能點到錯誤股票
    // ==============================================
    function findExactMatch(dropdown, code) {
        const children = dropdown.querySelectorAll('li, [role="option"]');
        for (const item of children) {
            const text = (item.innerText || item.textContent || '').trim();
            // 精確匹配：代號必須在開頭，後接空格（例如 "2330 台積電"）
            if (text.startsWith(code + ' ') || text === code) {
                return item;
            }
        }
        // fallback: 也檢查 childNodes（某些 jQuery UI 版本不用 li）
        for (const item of dropdown.childNodes) {
            if (item.nodeType !== 1) continue; // 只看 Element
            const text = (item.innerText || item.textContent || '').trim();
            if (text.startsWith(code + ' ') || text === code) {
                return item;
            }
        }
        return null;
    }

    // ==============================================
    // [修復 #3] 下單前驗證：檢查頁面上的價格/數量
    // ==============================================
    function validateBeforeSubmit(code) {
        // 嘗試讀取頁面上目前填入的股票名稱/代號
        const stockNameEl = document.querySelector('#app-container .stockName, #app-container .stock-name, #app-container .stockItemContainer .name');
        const qtyInput = document.querySelector('#app-container .stockItemContainer input[name*="qty"], #app-container .stockItemContainer input[name*="amount"]');

        const warnings = [];

        // 檢查：如果能找到股票名稱顯示區域，確認代號一致
        if (stockNameEl) {
            const displayedText = (stockNameEl.innerText || stockNameEl.textContent || '').trim();
            if (displayedText && !displayedText.includes(code)) {
                warnings.push(`頁面顯示的股票「${displayedText}」與預期代號 ${code} 不符`);
            }
        }

        // 檢查：如果能找到數量欄位，確認非空且合理
        if (qtyInput) {
            const qty = parseInt(qtyInput.value, 10);
            if (isNaN(qty) || qty <= 0) {
                warnings.push(`下單數量異常：${qtyInput.value || '(空)'}`);
            }
            if (qty > 999) {
                warnings.push(`下單數量 ${qty} 股，超過 999 股，請確認`);
            }
        }

        return warnings;
    }

    // ==============================================
    // 主處理流程
    // ==============================================
    async function processOne(code, confirmMode) {
        const inputEl = document.querySelector(S.in);
        const submitBtn = document.querySelector(S.ok);
        const dropdown = findDropdown();
        const typeSelect = document.querySelector(S.sel);
        const priceBtn = document.querySelector(S.hi);

        if (!inputEl || !submitBtn || !typeSelect || !priceBtn) {
            return { status: 'abort', reason: '找不到必要的頁面元素（input/button/select）' };
        }
        if (!dropdown) {
            return { status: 'abort', reason: '找不到下拉選單元素（已嘗試多種 selector）' };
        }

        await simulateTyping(inputEl, code);

        // 智慧動態等待下拉選單結果
        let matchLi = null;
        for (let waitTime = 0; waitTime < 3500; waitTime += 100) {
            matchLi = findExactMatch(dropdown, code);
            if (matchLi) break;
            await sleep(100);
        }

        if (!matchLi) {
            return { status: 'skip', reason: `下拉選單中找不到代號 ${code} 的匹配項` };
        }

        matchLi.click();
        await sleep(400);

        if (!(await selectOptionByValue(typeSelect, 'C'))) {
            return { status: 'skip', reason: `無法選擇「盤中零股」選項 (value="C")` };
        }

        await sleep(400);
        priceBtn.click();
        await sleep(250);

        // [修復 #3] 下單前驗證
        const warnings = validateBeforeSubmit(code);
        if (warnings.length > 0 && confirmMode) {
            const msg = `⚠️ 代號 ${code} 下單前警告：\n${warnings.map(w => '• ' + w).join('\n')}\n\n是否仍要送出？`;
            if (!confirm(msg)) {
                return { status: 'skip', reason: '使用者取消：' + warnings.join('; ') };
            }
        }

        submitBtn.click();
        await sleep(350);
        return { status: 'ok', reason: '' };
    }

    // ==============================================
    // UI 建構
    // ==============================================
    document.head.insertAdjacentHTML('beforeend', `<style>
#_p{position:fixed;top:72px;right:20px;width:268px;z-index:9999;font:13px -apple-system,system-ui,'Segoe UI',sans-serif;background:rgba(18,18,22,.92);backdrop-filter:blur(24px) saturate(180%);border:1px solid rgba(255,255,255,.08);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.05) inset;overflow:hidden;color:#e5e5ea}
#_h{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.06);cursor:move;user-select:none}
#_ht{font-weight:700;color:#f5f5f7;font-size:13px;display:flex;align-items:center;gap:7px}
#_gm{background:linear-gradient(135deg,#bf5af2,#5e5ce6,#64d2ff);-webkit-background-clip:text;color:transparent;font-size:10.5px;font-weight:800;letter-spacing:.3px}
#_tg{background:none;border:none;cursor:pointer;color:rgba(255,255,255,.4);font-size:15px;padding:0 3px;transition:color .2s}
#_tg:hover{color:rgba(255,255,255,.8)}
#_b{padding:11px 13px 14px;display:flex;flex-direction:column;gap:9px;transition:max-height .3s ease,opacity .24s,padding .3s;max-height:520px;overflow:hidden}
#_p.col #_b{max-height:0;opacity:0;padding:0 13px}
#_ta{width:100%;height:112px;resize:vertical;border:1.5px solid rgba(255,255,255,.1);border-radius:10px;padding:9px 11px;font-size:12.5px;background:rgba(255,255,255,.06);color:#f5f5f7;outline:none;font-family:inherit;box-sizing:border-box;transition:border-color .2s,box-shadow .2s}
#_ta::placeholder{color:rgba(255,255,255,.3)}
#_ta:focus{border-color:rgba(100,210,255,.5);box-shadow:0 0 0 3px rgba(100,210,255,.12)}
#_pv{font-size:11.5px;color:rgba(255,255,255,.5);background:rgba(255,255,255,.04);border-radius:8px;padding:6px 10px;transition:all .2s}
#_pv.on{background:rgba(100,210,255,.1);color:#64d2ff}
#_pg,#_st,#_bx,#_fa{display:none}
#_pg{flex-direction:column;gap:3px}
#_tr{height:4px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden}
#_fi{height:100%;width:0%;background:linear-gradient(90deg,#5e5ce6,#64d2ff);border-radius:99px;transition:width .35s ease}
#_pl{font-size:10.5px;color:rgba(255,255,255,.35);text-align:right}
#_st{align-items:center;gap:6px;font-size:12px;font-weight:500;color:rgba(255,255,255,.6)}
#_dt{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.2);flex-shrink:0;transition:background .3s}
.run #_dt{background:#64d2ff;animation:_a 1s infinite}.ok #_dt{background:#30d158}.warn #_dt{background:#ff9f0a}.err #_dt{background:#ff453a}
@keyframes _a{50%{opacity:.15}}
#_fa{background:rgba(255,69,58,.08);border:1px solid rgba(255,69,58,.2);border-radius:9px;padding:8px 10px;font-size:11px;color:#ff6961;line-height:1.7}
#_fc{color:#64d2ff;cursor:pointer;transition:opacity .2s}
#_fc:hover{opacity:.7}
#_ro{display:flex;gap:7px}
.rb{flex:1;height:34px;border:none;border-radius:10px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;font-family:inherit;font-size:12.5px;transition:transform .1s,opacity .15s}
.rb:active{transform:scale(.94)}
.rb:hover{opacity:.88}
#_bs{background:linear-gradient(135deg,#5e5ce6,#bf5af2);color:#fff;box-shadow:0 2px 12px rgba(94,92,230,.3)}
#_bx{background:rgba(255,69,58,.15);color:#ff453a}
#_bc{flex:0 0 34px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.5)}
#_cfm{display:flex;align-items:center;gap:6px;font-size:11.5px;color:rgba(255,255,255,.45);padding:0 2px}
#_cfm input{accent-color:#5e5ce6}
#_lg{max-height:90px;overflow-y:auto;font-size:10.5px;color:rgba(255,255,255,.35);background:rgba(0,0,0,.2);border-radius:8px;padding:6px 8px;line-height:1.6;display:none;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.15) transparent}
#_lg::-webkit-scrollbar{width:4px}
#_lg::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:2px}
#_ver{font-size:9.5px;color:rgba(255,255,255,.15);text-align:center;padding-top:2px}
</style>`);

    document.body.insertAdjacentHTML('beforeend', `<div id="_p">
<div id="_h"><b id="_ht">自動下單零股 <span id="_gm">v3.0 正式版</span></b><button id="_tg">⌃</button></div>
<div id="_b">
<textarea id="_ta" placeholder="輸入股票代號&#10;換行/逗號/空格皆可"></textarea>
<div id="_pv">尚未輸入代號</div>
<label id="_cfm"><input type="checkbox" id="_ck" checked> 異常時彈出確認框</label>
<div id="_pg"><div id="_tr"><div id="_fi"></div></div><div id="_pl"></div></div>
<div id="_st"><div id="_dt"></div><span id="_sm"></span></div>
<div id="_lg" id="_log"></div>
<div id="_fa">❌ 失敗：<span id="_f2"></span><br><span id="_fc">📋 複製重試</span></div>
<div id="_ro">
<button class="rb" id="_bs">▶ 開始下單</button>
<button class="rb" id="_bx">■ 停止</button>
<button class="rb" id="_bc">✕</button>
</div>
<div id="_ver">v3.0.0</div>
</div></div>`);

    // ==============================================
    // UI 邏輯與事件綁定
    // ==============================================
    const g = id => document.getElementById(id);
    const [ta, pv, pg, fi, pl, st, sm, fa, f2, bs, bx, bc, ck, lg] =
        ['_ta', '_pv', '_pg', '_fi', '_pl', '_st', '_sm', '_fa', '_f2', '_bs', '_bx', '_bc', '_ck', '_lg'].map(g);

    const setS = (m, c = '') => { st.style.display = 'flex'; st.className = c; sm.textContent = m; };
    const setPg = (d, t) => { fi.style.width = (t ? Math.round(d / t * 100) : 0) + '%'; pl.textContent = d + '/' + t; pg.style.display = 'flex'; };

    function addLog(msg) {
        lg.style.display = 'block';
        const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
        lg.textContent += `[${time}] ${msg}\n`;
        lg.scrollTop = lg.scrollHeight;
    }

    ta.addEventListener('input', () => {
        const c = parse(ta.value);
        pv.textContent = c.length ? '✓ ' + c.length + ' 筆：' + c.join('  ') : '尚未輸入代號';
        pv.className = c.length ? 'on' : '';
    });

    // ==============================================
    // [修復 #5] 競態條件：用 mutex 鎖防止重複執行
    // ==============================================
    let running = false;
    let stopRequested = false;

    async function startAll() {
        // 原子性檢查：防止多次點擊觸發多個執行
        if (running) return;
        running = true;

        const codes = parse(ta.value);
        if (!codes.length) {
            setS('請輸入有效代號', 'warn');
            running = false;
            return;
        }

        stopRequested = false;
        bs.style.display = 'none';
        bx.style.display = 'flex';
        bc.disabled = ta.disabled = true;
        fa.style.display = 'none';
        lg.textContent = '';
        lg.style.display = 'block';

        const confirmMode = ck.checked;
        const bad = [];
        const badReasons = {};
        const tot = codes.length;
        let done = 0;

        addLog(`開始處理 ${tot} 筆訂單` + (confirmMode ? '（已啟用異常確認）' : ''));

        for (const code of codes) {
            if (stopRequested) {
                setS('已停止', 'warn');
                addLog('⏹ 使用者手動停止');
                break;
            }

            setS('處理 ' + code + '（' + (done + 1) + '/' + tot + '）', 'run');

            try {
                let result = await processOne(code, confirmMode);

                // 首次失敗，提供一次重試機會
                if (result.status === 'skip') {
                    addLog(`⟳ ${code} 首次未成功（${result.reason}），重試中...`);
                    await sleep(600);
                    result = await processOne(code, confirmMode);
                }

                if (result.status === 'ok') {
                    addLog(`✓ ${code} 下單成功`);
                } else if (result.status === 'skip') {
                    addLog(`✗ ${code} 失敗：${result.reason}`);
                    bad.push(code);
                    badReasons[code] = result.reason;
                } else if (result.status === 'abort') {
                    addLog(`⛔ ${code} 嚴重錯誤：${result.reason}`);
                    addLog('⛔ 中止所有後續訂單');
                    bad.push(code);
                    badReasons[code] = result.reason;
                    // 標記剩餘的為「未處理」而非「失敗」
                    const remaining = codes.slice(done + 1);
                    if (remaining.length > 0) {
                        remaining.forEach(c => {
                            bad.push(c);
                            badReasons[c] = '因前序錯誤而未處理';
                        });
                        addLog(`⚠ ${remaining.length} 筆未處理：${remaining.join(', ')}`);
                    }
                    done++;
                    setPg(done, tot);
                    break;
                }
            } catch (e) {
                console.error('[Claude Opus] ' + code + ' error:', e);
                addLog(`✗ ${code} 例外錯誤：${e.message || e}`);
                bad.push(code);
                badReasons[code] = e.message || '未知例外';
            }

            setPg(++done, tot);
            if (!stopRequested) await sleep(500);
        }

        const okCount = tot - bad.length;
        if (bad.length) {
            setS(`完成：${okCount} 成功 / ${bad.length} 失敗`, 'warn');
            f2.textContent = bad.join('  ');
            fa.style.display = 'block';
        } else {
            setS(`全部完成 ${okCount} 筆 ✓`, 'ok');
        }

        addLog(`完成。成功 ${okCount} / 失敗 ${bad.length}`);

        running = false;
        bs.style.display = 'flex';
        bx.style.display = 'none';
        bc.disabled = ta.disabled = false;
    }

    bs.onclick = () => startAll(); // running 檢查已在函數內部
    bx.onclick = () => { stopRequested = true; };
    bc.onclick = () => {
        if (running) return;
        ta.value = '';
        pv.textContent = '尚未輸入代號';
        pv.className = '';
        lg.textContent = '';
        [st, pg, fa, lg].forEach(e => e.style.display = 'none');
    };

    // [修復 #8] Clipboard API 加上錯誤處理
    g('_fc').onclick = () => {
        const text = f2.textContent.trim().replace(/\s+/g, '\n');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                g('_fc').textContent = '已複製 ✓';
                setTimeout(() => g('_fc').textContent = '📋 複製重試', 2000);
            }).catch(() => {
                // fallback: 用舊式方法
                fallbackCopy(text);
            });
        } else {
            fallbackCopy(text);
        }
    };

    function fallbackCopy(text) {
        const t = document.createElement('textarea');
        t.value = text;
        t.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(t);
        t.select();
        try {
            document.execCommand('copy');
            g('_fc').textContent = '已複製 ✓';
        } catch {
            g('_fc').textContent = '複製失敗';
        }
        document.body.removeChild(t);
        setTimeout(() => g('_fc').textContent = '📋 複製重試', 2000);
    }

    // 折疊切換
    g('_tg').onclick = () => {
        const c = g('_p').classList.toggle('col');
        g('_tg').textContent = c ? '⌄' : '⌃';
    };

    // ==============================================
    // [修復 #9] 拖曳面板：加入邊界夾持
    // ==============================================
    let dragState = null;
    const panel = g('_p');

    g('_h').onmousedown = e => {
        if (e.target.id === '_tg') return;
        const r = panel.getBoundingClientRect();
        dragState = { x: e.clientX - r.left, y: e.clientY - r.top };
        e.preventDefault(); // 防止選取文字
    };

    document.onmousemove = e => {
        if (!dragState) return;
        const maxX = window.innerWidth - panel.offsetWidth;
        const maxY = window.innerHeight - 40; // 至少保留標題列可見
        const newX = Math.max(0, Math.min(e.clientX - dragState.x, maxX));
        const newY = Math.max(0, Math.min(e.clientY - dragState.y, maxY));
        panel.style.right = 'auto';
        panel.style.left = newX + 'px';
        panel.style.top = newY + 'px';
    };

    document.onmouseup = () => { dragState = null; };

})();
