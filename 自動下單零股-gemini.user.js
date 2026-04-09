// ==UserScript==
// @name         自動下單零股 (Gemini 增強版)
// @namespace    https://github.com/roazhang/TdccAuto
// @version      3.2.0-gemini
// @description  結合高質感 UI，並參照穩定的 2.0 版本重建精確的鍵盤模擬核心
// @author       roazhang & Gemini
// @match        https://www.sinotrade.com.tw/inside/Batch_Order
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const S = {
        in: '#app-container input',
        ok: '#app-container button.midbtn.submit',
        dd: '#ui-id-2',
        sel: '#app-container .stockItemContainer select',
        hi: '#app-container .stockItemContainer button.priceBtn.smallBtn.high'
    };

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const parse = s => s.split(/[\n,，\s]+/).map(v => v.trim()).filter(v => /^\d{4,6}$/.test(v));

    // ==============================================
    // 參照 2.0.0 的嚴謹鍵盤事件機制
    // 2.1.0 誤把 keydown 與 keyup 事件刪除了，導致網站沒法觸發下拉選單！
    // ==============================================
    async function simulateTyping(el, text) {
        el.focus();
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(30);

        for (const char of text) {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
            nativeSetter.call(el, el.value + char);
            el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: char }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
            await sleep(40);
        }
    }

    async function selectOptionByValue(sel, val) {
        const opt = Array.from(sel.options).find(o => o.value === val && o.style.display !== 'none');
        if (!opt) return false;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        nativeSetter.call(sel, val);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    async function processOne(code) {
        const inputEl = document.querySelector(S.in);
        const submitBtn = document.querySelector(S.ok);
        const dropdown = document.querySelector(S.dd);
        const typeSelect = document.querySelector(S.sel);
        const priceBtn = document.querySelector(S.hi);

        if (!inputEl || !submitBtn || !dropdown || !typeSelect || !priceBtn) {
            return 'abort';
        }

        await simulateTyping(inputEl, code);
        
        // 【最核心的效能突破】：破除 2.0 版無論如何都要死等 0.9 秒的設定。
        // 改為智慧動態等待：一旦資料提早出來就瞬間點擊，能省下大量無意義的等待時間；
        // 如果網路塞車，最多也能耐心等到 3.5 秒防漏單，大幅超越 2.0.0 的僵化設計！
        let matchLi = null;
        for(let waitTime = 0; waitTime < 3500; waitTime += 100) {
            const item = dropdown.childNodes[0];
            if (item && item.innerText?.startsWith(code + ' ')) {
                matchLi = item;
                break;
            }
            await sleep(100);
        }

        if (!matchLi) return 'skip';

        matchLi.click();
        await sleep(400);

        if (!(await selectOptionByValue(typeSelect, 'C'))) {
            return 'skip';
        }

        await sleep(400);
        priceBtn.click();
        await sleep(250);
        submitBtn.click();
        await sleep(350);
        return 'ok';
    }

    // ==============================================
    // UI 建構與事件綁定 (Gemini 面板)
    // ==============================================
    document.head.insertAdjacentHTML('beforeend', `<style>
#_p{position:fixed;top:72px;right:20px;width:252px;z-index:9999;font:13px -apple-system,system-ui,sans-serif;background:rgba(255,255,255,.88);backdrop-filter:blur(20px);border:1px solid rgba(0,0,0,.09);border-radius:14px;box-shadow:0 6px 22px rgba(0,0,0,.11);overflow:hidden}
#_h{display:flex;align-items:center;justify-content:space-between;padding:10px 13px;border-bottom:1px solid rgba(0,0,0,.07)}
#_ht{font-weight:600;color:#111;font-size:13px;display:flex;align-items:center;gap:6px;}
#_gm{background:linear-gradient(135deg,#aa00ff,#00e5ff);-webkit-background-clip:text;color:transparent;font-size:11px;font-weight:800}
#_tg{background:none;border:none;cursor:pointer;color:#aaa;font-size:14px;padding:0 2px}
#_b{padding:10px 12px 13px;display:flex;flex-direction:column;gap:8px;transition:max-height .28s,opacity .22s;max-height:440px;overflow:hidden}
#_p.col #_b{max-height:0;opacity:0;padding:0}
#_ta{width:100%;height:108px;resize:vertical;border:1.5px solid rgba(0,0,0,.1);border-radius:9px;padding:8px 10px;font-size:12.5px;background:rgba(255,255,255,.7);outline:none;font-family:inherit;box-sizing:border-box}
#_ta:focus{border-color:rgba(0,122,255,.5);box-shadow:0 0 0 3px rgba(0,122,255,.1)}
#_pv{font-size:11.5px;color:#666;background:rgba(0,0,0,.04);border-radius:7px;padding:5px 9px}
#_pv.on{background:rgba(0,122,255,.07);color:#0a56e0}
#_pg,#_st,#_bx,#_fa{display:none}
#_pg{flex-direction:column;gap:2px}
#_tr{height:4px;background:rgba(0,0,0,.07);border-radius:99px;overflow:hidden}
#_fi{height:100%;width:0%;background:linear-gradient(90deg,#007aff,#00e5ff);border-radius:99px;transition:width .35s}
#_pl{font-size:10.5px;color:#aaa;text-align:right}
#_st{align-items:center;gap:5px;font-size:12px;font-weight:500;color:#666}
#_dt{width:6px;height:6px;border-radius:50%;background:#aaa;flex-shrink:0}
.run #_dt{background:#007aff;animation:_a 1s infinite}.ok #_dt{background:#30d158}.warn #_dt{background:#ff9f0a}
@keyframes _a{50%{opacity:.15}}
#_fa{background:rgba(255,59,48,.06);border:1px solid rgba(255,59,48,.18);border-radius:8px;padding:7px 9px;font-size:11px;color:#c0392b;line-height:1.6}
#_fc{color:#007aff;cursor:pointer}
#_ro{display:flex;gap:7px}
.rb{flex:1;height:33px;border:none;border-radius:9px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;font-family:inherit;font-size:12.5px;transition:transform .1s}
.rb:active{transform:scale(.95)}
#_bs{background:linear-gradient(135deg,#007aff,#005ad6);color:#fff;box-shadow:0 2px 10px rgba(0,122,255,.25)}
#_bx{background:rgba(255,59,48,.1);color:#ff3b30}
#_bc{flex:0 0 33px;background:rgba(0,0,0,.05);color:#666}
</style>`);

    document.body.insertAdjacentHTML('beforeend', `<div id="_p">
<div id="_h"><b id="_ht">自動下單零股 <span id="_gm">✦ Gemini</span></b><button id="_tg">⌃</button></div>
<div id="_b">
<textarea id="_ta" placeholder="輸入股票代號&#10;換行/逗號/空格皆可"></textarea>
<div id="_pv">尚未輸入代號</div>
<div id="_pg"><div id="_tr"><div id="_fi"></div></div><div id="_pl"></div></div>
<div id="_st"><div id="_dt"></div><span id="_sm"></span></div>
<div id="_fa">❌ 失敗：<span id="_f2"></span><br><span id="_fc">複製重試</span></div>
<div id="_ro">
<button class="rb" id="_bs">▶ 開始下單</button>
<button class="rb" id="_bx">■ 停止</button>
<button class="rb" id="_bc">✕</button>
</div></div></div>`);

    const g = id => document.getElementById(id);
    const [ta, pv, pg, fi, pl, st, sm, fa, f2, bs, bx, bc] =
        ['_ta', '_pv', '_pg', '_fi', '_pl', '_st', '_sm', '_fa', '_f2', '_bs', '_bx', '_bc'].map(g);

    const setS = (m, c = '') => { st.style.display = 'flex'; st.className = c; sm.textContent = m; };
    const setPg = (d, t) => { fi.style.width = (t ? Math.round(d / t * 100) : 0) + '%'; pl.textContent = d + '/' + t; pg.style.display = 'flex'; };

    ta.addEventListener('input', () => {
        const c = parse(ta.value);
        pv.textContent = c.length ? '✓ ' + c.length + ' 筆：' + c.join('  ') : '尚未輸入代號';
        pv.className = c.length ? 'on' : '';
    });

    let run = false, stop = false;

    async function startAll() {
        const codes = parse(ta.value);
        if (!codes.length) { setS('請輸入有效代號', 'warn'); return; }
        run = true; stop = false;
        bs.style.display = 'none'; bx.style.display = 'flex'; bc.disabled = ta.disabled = true; fa.style.display = 'none';
        
        const bad = [], tot = codes.length; let done = 0;
        
        for (const code of codes) {
            if (stop) { setS('已停止', 'warn'); break; }
            setS('處理 ' + code + '（' + (done + 1) + '/' + tot + '）', 'run');
            
            try {
                let r = await processOne(code);
                // 如同先前的設計：如果錯過 API 或抓不到，則提供一次重試機會
                if (r === 'skip') {
                    await sleep(600);
                    r = await processOne(code);
                }
                
                if (r === 'skip') bad.push(code);
                if (r === 'abort') { bad.push(...codes.slice(done)); break; }
            } catch (e) {
                console.error('[Gemini Version] ' + code + ' error:', e);
                bad.push(code);
            }
            
            setPg(++done, tot);
            if (!stop) await sleep(500);
        }
        
        const ok2 = tot - bad.length;
        setS(bad.length ? '完成：' + ok2 + ' 成功 / ' + bad.length + ' 失敗' : '全部完成 ' + ok2 + ' 筆 ✓', bad.length ? 'warn' : 'ok');
        if (bad.length) { f2.textContent = bad.join('  '); fa.style.display = 'block'; }
        
        run = false; bs.style.display = 'flex'; bx.style.display = 'none'; bc.disabled = ta.disabled = false;
    }

    bs.onclick = () => { if (!run) startAll(); };
    bx.onclick = () => { stop = true; };
    bc.onclick = () => {
        if (run) return;
        ta.value = ''; pv.textContent = '尚未輸入代號'; pv.className = '';
        [st, pg, fa].forEach(e => e.style.display = 'none');
    };

    g('_fc').onclick = () => {
        navigator.clipboard.writeText(f2.textContent.trim().replace(/\s+/g, '\n'));
        g('_fc').textContent = '已複製 ✓'; setTimeout(() => g('_fc').textContent = '複製重試', 2000);
    };

    g('_tg').onclick = () => { const c = g('_p').classList.toggle('col'); g('_tg').textContent = c ? '⌄' : '⌃'; };

    let dr = null; const rp = g('_p');
    g('_h').onmousedown = e => {
        if (e.target.id === '_tg') return;
        const r = rp.getBoundingClientRect(); dr = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    document.onmousemove = e => {
        if (!dr) return;
        rp.style.right = 'auto'; rp.style.left = (e.clientX - dr.x) + 'px'; rp.style.top = (e.clientY - dr.y) + 'px';
    };
    document.onmouseup = () => dr = null;

})();
