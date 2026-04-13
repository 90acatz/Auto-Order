# 永豐自動下單零股 (Auto-Order)

> **GitHub**：[https://github.com/90acatz/Auto-Order](https://github.com/90acatz/Auto-Order)  
> **作者**：acatz  
> **授權**：MIT

這是一個專為永豐金證券（Sinotrade）批次下單網頁設計的 **TamperMonkey 零股自動下單腳本**。  
經過多版本疊代與安全強化，目前版本結合了高質感介面、極致操作效率，以及金融交易級別的安全防呆機制。

---

## ✨ 功能亮點

- **🛡️ 下單前防護**：送出前深度驗證股票名稱與數量，超過 999 股自動攔截並彈出警告
- **🎯 精確匹配**：掃描下拉選單所有節點，精確比對代號，避免誤選名稱相近的個股
- **🤖 智慧動態等待**：最長 3.5 秒容錯緩衝，網路不穩依然不漏單
- **🔒 原型鏈防護**：繞過 React/Vue 前端框架安全鎖，確保原生輸入事件正常觸發
- **📱 Glassmorphism 面板**：現代化毛玻璃控制面板，內建操作日誌與動態進度條，支援拖曳

---

## 🚀 系統需求

- 瀏覽器：Google Chrome / Microsoft Edge
- 擴充套件：[Tampermonkey](https://www.tampermonkey.net/)

---

## 📦 安裝方式

### 第一步：安裝 TamperMonkey
- Chrome：[安裝 Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- Edge：[安裝 Tampermonkey](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

### 第二步：一鍵安裝腳本

點擊下方連結，TamperMonkey 會自動偵測並詢問是否安裝：

**👉 [點此安裝 自動下單3.0.user.js](https://raw.githubusercontent.com/90acatz/Auto-Order/main/%E8%87%AA%E5%8B%95%E4%B8%8B%E5%96%AE3.0.user.js)**

> 或手動下載 `自動下單3.0.user.js`，在 TamperMonkey 中選擇「從檔案安裝」。  
> 若有舊版本，建議先停用或移除以免衝突。

---

## 📖 使用說明

1. **貼上代號**：將今日要下單的零股代碼貼入輸入框（支援換行、空格、逗號，格式自由）
2. **確認防呆**：建議勾選「異常時彈出確認框」，多一層保障
3. **一鍵開始**：按下「▶ 開始下單」，腳本即自動以「盤中零股 + 漲停價」批次送出所有標的

---

## 🔖 版本命名規則

| 修改幅度 | 版本升級方式 | 範例 |
|---|---|---|
| 修改超過 50 行 | **主版本升級** | `3.0.260413` → `4.0` |
| 修改介於 5～50 行 | **次版本升級** | `3.0.260413` → `3.1` |
| 修改低於 5 行 | **修訂號改為日期（YYMMDD）** | `3.0` → `3.0.260413` |

---

## 📝 更新紀錄

| 版本 | 日期 | 說明 |
|---|---|---|
| 3.0.260413 | 2026-04-13 | 更新 namespace、author；修訂號變更為日期命名 |
| 3.0.0 | 2026-04-13 | 正式發布：整合高安全性驗證、精確匹配、Glassmorphism UI、拖曳面板 |
