// ==UserScript==
// @name         自動下單零股
// @namespace    https://github.com/zxc88645/TdccAuto/blob/main/SinotradeStockHelper.js
// @version      1.1.0
// @description  將需要購買的零股代號輸入到下方區塊（支援換行、逗號、空格混合輸入），將會自動為您依序下單到暫存。遇到失敗會自動跳過並記錄。
// @author       Owen (優化版)
// @match        https://www.sinotrade.com.tw/inside/Batch_Order
// @icon         https://raw.githubusercontent.com/zxc88645/TdccAuto/refs/heads/main/img/TdccAuto_icon.png
// @grant        none
// @license      MIT
// @homepage     https://github.com/zxc88645/TdccAuto
// @downloadURL https://update.greasyfork.org/scripts/530246/%E8%87%AA%E5%8B%95%E4%B8%8B%E5%96%AE%E9%9B%B6%E8%82%A1.user.js
// @updateURL https://update.greasyfork.org/scripts/530246/%E8%87%AA%E5%8B%95%E4%B8%8B%E5%96%AE%E9%9B%B6%E8%82%A1.meta.js
// ==/UserScript==

(function () {
    'use strict';

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const selectors = {
        input: "#app-container input",
        button: "#app-container button.midbtn.submit",
        selectionMenu: "#ui-id-2",
        select: "#app-container .stockItemContainer select",
        priceButton: "#app-container .stockItemContainer button.priceBtn.smallBtn.high"
    };

    // ── 解析輸入：支援換行 / 逗號 / 全形逗號 / 空白 混合 ──
    function parseStockCodes(raw) {
        return raw
            .split(/[\n,，\s]+/)
            .map(s => s.trim())
            .filter(s => /^\d{4,6}$/.test(s)); // 只保留 4~6 位數字（股票代號）
    }

    // ── 建立 UI 面板 ──
    const bodyWrapper = document.querySelector(".body-wrapper");
    if (!bodyWrapper) return;

    const panel = document.createElement("div");
    Object.assign(panel.style, {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        marginLeft: "50px",
        marginTop: "16px",
        width: "220px",
        fontFamily: "sans-serif",
        fontSize: "13px"
    });

    // 標題
    const title = document.createElement("div");
    title.textContent = "📋 自動下單零股";
    Object.assign(title.style, { fontWeight: "bold", fontSize: "14px" });

    // 說明
    const hint = document.createElement("div");
    hint.textContent = "支援換行、逗號、空格混合輸入";
    hint.style.color = "#888";

    // 輸入區
    const textArea = document.createElement("textarea");
    Object.assign(textArea.style, {
        width: "100%",
        height: "180px",
        boxSizing: "border-box",
        padding: "6px",
        border: "1px solid #ccc",
        borderRadius: "4px",
        resize: "vertical"
    });
    textArea.placeholder = "例：2330, 2317\n0050 006208\n00878";

    // 解析預覽
    const preview = document.createElement("div");
    preview.style.color = "#555";
    preview.textContent = "尚未輸入股票代號";

    // 更新預覽
    function updatePreview() {
        const codes = parseStockCodes(textArea.value);
        preview.textContent = codes.length > 0
            ? `✅ 辨識到 ${codes.length} 筆：${codes.join(", ")}`
            : "⚠️ 尚未輸入有效股票代號";
    }
    textArea.addEventListener("input", updatePreview);

    // 進度列
    const progressBar = document.createElement("div");
    Object.assign(progressBar.style, {
        width: "100%",
        height: "8px",
        backgroundColor: "#e0e0e0",
        borderRadius: "4px",
        overflow: "hidden",
        display: "none"
    });
    const progressFill = document.createElement("div");
    Object.assign(progressFill.style, {
        height: "100%",
        width: "0%",
        backgroundColor: "#4caf50",
        transition: "width 0.3s"
    });
    progressBar.appendChild(progressFill);

    // 狀態文字
    const statusText = document.createElement("div");
    statusText.style.color = "#333";
    statusText.textContent = "";

    // 失敗清單
    const failedList = document.createElement("div");
    Object.assign(failedList.style, {
        color: "#c0392b",
        fontSize: "12px",
        whiteSpace: "pre-wrap",
        display: "none"
    });

    // 開始按鈕
    const startBtn = document.createElement("button");
    startBtn.textContent = "▶ 開始下單";
    Object.assign(startBtn.style, {
        padding: "6px 12px",
        backgroundColor: "#1976d2",
        color: "#fff",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        fontWeight: "bold"
    });

    // 停止按鈕
    const stopBtn = document.createElement("button");
    stopBtn.textContent = "⏹ 停止";
    Object.assign(stopBtn.style, {
        padding: "6px 12px",
        backgroundColor: "#e53935",
        color: "#fff",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        display: "none"
    });

    panel.append(title, hint, textArea, preview, startBtn, stopBtn, progressBar, statusText, failedList);
    bodyWrapper.appendChild(panel);

    // ── 狀態 ──
    let isProcessing = false;
    let shouldStop = false;
    let queue = [];
    let total = 0;
    let failedCodes = [];

    function setStatus(msg, color = "#333") {
        statusText.textContent = msg;
        statusText.style.color = color;
    }

    function setProgress(done, all) {
        const pct = all > 0 ? Math.round((done / all) * 100) : 0;
        progressFill.style.width = `${pct}%`;
        progressBar.style.display = "block";
    }

    // ── 核心：處理單一股票代號 ──
    async function processOne(value) {
        const inputElement = document.querySelector(selectors.input);
        const buttonElement = document.querySelector(selectors.button);
        const selectionMenu = document.querySelector(selectors.selectionMenu);
        const selectElement = document.querySelector(selectors.select);
        const priceButton = document.querySelector(selectors.priceButton);

        if (!inputElement || !buttonElement || !selectionMenu || !selectElement || !priceButton) {
            console.warn("必要的 DOM 元素未找到");
            return false;
        }

        await simulateTyping(inputElement, value);
        await sleep(1000);

        // 確認下拉選單出現且第一筆以該代號開頭
        if (selectionMenu.childNodes.length === 0 || !selectionMenu.childNodes[0].innerText.startsWith(value + ' ')) {
            console.warn(`[${value}] 查無此股票，略過`);
            return false;
        }

        console.log(`[${value}] 選擇：${selectionMenu.childNodes[0].innerText}`);
        selectionMenu.childNodes[0].click();
        await sleep(500);

        if (!(await selectOptionByValue(selectElement, "C"))) {
            console.warn(`[${value}] 選項 C 不存在，略過`);
            return false;
        }

        await sleep(500);
        await simulateClick(priceButton);
        await sleep(300);
        await simulateClick(buttonElement);
        await sleep(300);
        return true;
    }

    // ── 主流程 ──
    async function startProcessing() {
        const codes = parseStockCodes(textArea.value);
        if (codes.length === 0) {
            setStatus("⚠️ 沒有有效的股票代號", "#e67e22");
            return;
        }

        isProcessing = true;
        shouldStop = false;
        queue = [...codes];
        total = codes.length;
        failedCodes = [];
        failedList.style.display = "none";
        failedList.textContent = "";

        startBtn.style.display = "none";
        stopBtn.style.display = "inline-block";
        textArea.disabled = true;

        let done = 0;

        for (const code of codes) {
            if (shouldStop) {
                setStatus("⛔ 已停止", "#e53935");
                break;
            }

            setStatus(`⏳ 處理中 ${code}（${done + 1}/${total}）`, "#1976d2");
            setProgress(done, total);

            try {
                const success = await processOne(code);
                if (!success) failedCodes.push(code);
            } catch (e) {
                console.error(`[${code}] 例外錯誤：`, e);
                failedCodes.push(code);
            }

            done++;
            setProgress(done, total);

            // 每筆之間稍微停頓，避免網頁反應不及
            if (!shouldStop) await sleep(600);
        }

        if (!shouldStop) {
            const successCount = total - failedCodes.length;
            setStatus(`✅ 完成！成功 ${successCount} / ${total} 筆`, "#388e3c");
        }

        if (failedCodes.length > 0) {
            failedList.textContent = `❌ 失敗代號（可重新貼回輸入區）：\n${failedCodes.join(", ")}`;
            failedList.style.display = "block";
        }

        isProcessing = false;
        startBtn.style.display = "inline-block";
        stopBtn.style.display = "none";
        textArea.disabled = false;
    }

    startBtn.addEventListener("click", () => {
        if (!isProcessing) startProcessing();
    });

    stopBtn.addEventListener("click", () => {
        shouldStop = true;
    });

    // ── 工具函式 ──
    async function simulateTyping(element, text) {
        if (!element) return;
        element.focus();
        element.value = "";
        for (let char of text) {
            element.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
            element.value += char;
            element.dispatchEvent(new InputEvent("input", { bubbles: true }));
            element.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
            await sleep(50);
        }
    }

    async function selectOptionByValue(selectElement, value) {
        if (!selectElement) return false;
        const option = Array.from(selectElement.options).find(
            opt => opt.value === value && opt.style.display !== "none"
        );
        if (option) {
            selectElement.value = value;
            selectElement.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
        }
        return false;
    }

    async function simulateClick(element) {
        if (!element) return;
        element.click();
        await sleep(100);
    }

})();
