// ==UserScript==
// @name         自動下單零股
// @namespace    https://github.com/roazhang/TdccAuto
// @version      2.1.0
// @description  零股自動下單，換行/逗號/空格皆可
// @author       roazhang
// @match        https://www.sinotrade.com.tw/inside/Batch_Order
// @grant        none
// @license      MIT
// ==/UserScript==
(()=>{'use strict';
// Delay helper
const D=ms=>new Promise(r=>setTimeout(r,ms));
// Target selectors on sinotrade batch-order page
const S={in:'#app-container input',ok:'#app-container button.midbtn.submit',
  dd:'#ui-id-2',sel:'#app-container .stockItemContainer select',
  hi:'#app-container .stockItemContainer button.priceBtn.smallBtn.high'};
// Parse raw input: split on newline/comma/space, keep 4-6 digit codes
const parse=s=>s.split(/[\n,，\s]+/).map(v=>v.trim()).filter(v=>/^\d{4,6}$/.test(v));
// Inject minimal Apple-style panel CSS
document.head.insertAdjacentHTML('beforeend',`<style>
#_p{position:fixed;top:72px;right:20px;width:252px;z-index:9999;font:13px -apple-system,system-ui,sans-serif;background:rgba(255,255,255,.88);backdrop-filter:blur(20px);border:1px solid rgba(0,0,0,.09);border-radius:14px;box-shadow:0 6px 22px rgba(0,0,0,.11);overflow:hidden}
#_h{display:flex;align-items:center;justify-content:space-between;padding:10px 13px;border-bottom:1px solid rgba(0,0,0,.07)}
#_ht{font-weight:600;color:#111;font-size:13px}
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
#_fi{height:100%;width:0%;background:#007aff;border-radius:99px;transition:width .35s}
#_pl{font-size:10.5px;color:#aaa;text-align:right}
#_st{align-items:center;gap:5px;font-size:12px;font-weight:500;color:#666}
#_dt{width:6px;height:6px;border-radius:50%;background:#aaa;flex-shrink:0}
.run #_dt{background:#007aff;animation:_a 1s infinite}.ok #_dt{background:#30d158}.warn #_dt{background:#ff9f0a}
@keyframes _a{50%{opacity:.15}}
#_fa{background:rgba(255,59,48,.06);border:1px solid rgba(255,59,48,.18);border-radius:8px;padding:7px 9px;font-size:11px;color:#c0392b;line-height:1.6}
#_fc{color:#007aff;cursor:pointer}
#_ro{display:flex;gap:7px}
.rb{flex:1;height:33px;border:none;border-radius:9px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;font-family:inherit;font-size:12.5px}
.rb:active{opacity:.75}
#_bs{background:#007aff;color:#fff;box-shadow:0 2px 10px rgba(0,122,255,.25)}
#_bx{background:rgba(255,59,48,.1);color:#ff3b30}
#_bc{flex:0 0 33px;background:rgba(0,0,0,.05);color:#666}
</style>`);
// Build panel markup
document.body.insertAdjacentHTML('beforeend',`<div id="_p">
<div id="_h"><b id="_ht">自動下單零股</b><button id="_tg">⌃</button></div>
<div id="_b">
<textarea id="_ta" placeholder="輸入股票代號&#10;換行/逗號/空格皆可"></textarea>
<div id="_pv">尚未輸入代號</div>
<div id="_pg"><div id="_tr"><div id="_fi"></div></div><div id="_pl" id="_pl"></div></div>
<div id="_st"><div id="_dt"></div><span id="_sm"></span></div>
<div id="_fa">❌ 失敗：<span id="_f2"></span><br><span id="_fc">複製重試</span></div>
<div id="_ro">
<button class="rb" id="_bs">▶ 開始下單</button>
<button class="rb" id="_bx">■ 停止</button>
<button class="rb" id="_bc">✕</button>
</div></div></div>`);
// DOM refs
const g=id=>document.getElementById(id);
const[ta,pv,pg,fi,pl,st,sm,fa,f2,bs,bx,bc]=
  ['_ta','_pv','_pg','_fi','_pl','_st','_sm','_fa','_f2','_bs','_bx','_bc'].map(g);
// Helpers: set status and progress
const setS=(m,c='')=>{st.style.display='flex';st.className=c;sm.textContent=m};
const setPg=(d,t)=>{fi.style.width=(t?Math.round(d/t*100):0)+'%';
  pl.textContent=d+'/'+t;pg.style.display='flex'};
// Live preview while typing
ta.addEventListener('input',()=>{const c=parse(ta.value);
  pv.textContent=c.length?'✓ '+c.length+' 筆：'+c.join('  '):'尚未輸入代號';
  pv.className=c.length?'on':'';});
// Use native property setters to bypass React/Vue's controlled-input lock
const niv=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
const nsv=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;
// Simulate keystroke-by-keystroke input to trigger autocomplete
async function type(el,text){
  el.focus();niv.call(el,'');el.dispatchEvent(new Event('input',{bubbles:!0}));await D(20);
  for(const c of text){niv.call(el,el.value+c);
    el.dispatchEvent(new InputEvent('input',{bubbles:!0,inputType:'insertText',data:c}));await D(40);}
}
// Set select value + fire change for framework reactivity
function setOpt(se,v){
  if(!Array.from(se.options).some(o=>o.value===v&&o.style.display!=='none'))return!1;
  nsv.call(se,v);se.dispatchEvent(new Event('change',{bubbles:!0}));return!0;
}
// Process single code: ok | skip | abort
async function one(code){
  const el=document.querySelector(S.in),dd=document.querySelector(S.dd),
    se=document.querySelector(S.sel),hi=document.querySelector(S.hi),ok=document.querySelector(S.ok);
  if(!el||!dd||!se||!hi||!ok)return'abort';   // critical DOM missing
  await type(el,code);await D(900);            // type + wait for dropdown
  const f=dd.childNodes[0];
  if(!f?.innerText?.startsWith(code+' '))return'skip'; // code not matched
  f.click();await D(400);                      // select from dropdown
  if(!setOpt(se,'C'))return'skip';             // set odd-lot type
  await D(400);hi.click();await D(250);        // click limit-up price
  ok.click();await D(350);return'ok';          // stage the order
}
// Main processing loop
let run=!1,stop=!1;
async function startAll(){
  const codes=parse(ta.value);
  if(!codes.length){setS('請輸入有效股票代號','warn');return;}
  run=!0;stop=!1;
  bs.style.display='none';bx.style.display='flex';bc.disabled=ta.disabled=!0;fa.style.display='none';
  const bad=[],tot=codes.length;let done=0;
  for(const code of codes){
    if(stop){setS('已停止','warn');break;}
    setS('處理 '+code+'（'+(done+1)+'/'+tot+'）','run');
    try{const r=await one(code);
      if(r==='skip')bad.push(code);
      if(r==='abort'){bad.push(...codes.slice(done));break;} // abort: rest all fail
    }catch(e){bad.push(code);}
    setPg(++done,tot);if(!stop)await D(500);   // inter-order pause
  }
  const ok2=tot-bad.length;
  setS(bad.length?'完成：'+ok2+' 成功 / '+bad.length+' 失敗':'全部完成 '+ok2+' 筆 ✓',bad.length?'warn':'ok');
  if(bad.length){f2.textContent=bad.join('  ');fa.style.display='block';}
  run=!1;bs.style.display='flex';bx.style.display='none';bc.disabled=ta.disabled=!1;
}
bs.onclick=()=>{if(!run)startAll();};
bx.onclick=()=>{stop=!0;};
bc.onclick=()=>{if(run)return;ta.value='';pv.textContent='尚未輸入代號';
  pv.className='';[st,pg,fa].forEach(e=>e.style.display='none');};
// Copy failed codes to clipboard
g('_fc').onclick=()=>{navigator.clipboard.writeText(f2.textContent.trim().replace(/\s+/g,'\n'));
  g('_fc').textContent='已複製 ✓';setTimeout(()=>g('_fc').textContent='複製重試',2000);};
// Collapse / expand
g('_tg').onclick=()=>{const c=g('_p').classList.toggle('col');g('_tg').textContent=c?'⌄':'⌃';};
// Draggable (mousedown on header → track movement)
let dr=null;const rp=g('_p');
g('_h').onmousedown=e=>{if(e.target.id==='_tg')return;
  const r=rp.getBoundingClientRect();dr={x:e.clientX-r.left,y:e.clientY-r.top};};
document.onmousemove=e=>{if(!dr)return;rp.style.right='auto';
  rp.style.left=(e.clientX-dr.x)+'px';rp.style.top=(e.clientY-dr.y)+'px';};
document.onmouseup=()=>dr=null;
})();
