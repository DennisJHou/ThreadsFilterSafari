---
editor_options: 
  markdown: 
    wrap: 72
---

# Porting Plan：將 ThreadsFilter Chrome 擴充功能移植到 Safari（iOS / iPadOS / macOS）

## 背景 Context

NTU MIL lab 的研究團隊目前有一個用於過濾 Threads 動態內容的 Chrome
擴充功能。 由於多數受試者都在手機上使用 Threads，Chrome
擴充功能造成了「生態效度 (ecological
validity)」的問題。目標是把現有擴充功能移植成 **Safari Web
Extension**，使其能在 iPhone / iPad（iOS / iPadOS 15+）上執行，並透過
App Store / TestFlight 發佈。

iOS 15+ 完整支援 Safari Web Extensions —— 它們會被包成一個原生 iOS App
（wrapper app）並放上 App Store。WebExtensions API 與 Chrome 的擴充功能
API 大致相容，因此這個移植以中等工程量即可完成。

------------------------------------------------------------------------

## 重要：本專案的實際結構（與原始計畫不同）

> ⚠️ 原始計畫假設原始碼放在 `Frontend/`
> 目錄下，**但實際上所有擴充功能檔案 都直接放在 repo
> 根目錄**。請以此文件為準。

實際檔案結構（repo 根目錄）：

```         
ThreadsFilterSafari/
├── manifest.json          # MV3 manifest
├── config.js              # Globals 設定（server_url 等）
├── launcher.js            # content script 進入點，注入 injected.js
├── logic.js               # content script，banner + feed 處理
├── events.js              # content script，事件追蹤（純 DOM）
├── injected.js            # 注入頁面 context，hook XHR/fetch
├── service_worker.js      # background service worker（alarms/onInstalled）
├── injected.bk            # ⚠️ 備份檔，應刪除
├── icons/                 # icon16/32/48/128.png
├── libs/
│   ├── jquery.min.js
│   ├── timeme.min.js
│   ├── client.js          # HTTP client（用到 chrome.runtime.getManifest）
│   ├── utils.js
│   └── .client.js.swp     # ⚠️ vim swap 檔，應刪除
├── menu/
│   ├── options.html       # popup
│   ├── options.js         # 用到 chrome.storage.sync
│   └── options.css
└── static/style.css
```

### 完整的 `chrome.*` 使用清單（已用 grep 全面盤點）

| 檔案 | 行 | 呼叫 | 執行 context |
|----|----|----|----|
| `service_worker.js` | 3,5,12,13,15,17,31 | `chrome.runtime.onInstalled`, `chrome.tabs.create`, `chrome.alarms.*`, `chrome.storage.sync.*` | background |
| `launcher.js` | 4,39 | `chrome.storage.sync.get`, `chrome.runtime.getURL` | content script |
| `logic.js` | 76,80,85,86 | `chrome.storage.sync.set` ×4 | content script |
| `libs/client.js` | 5 | `chrome.runtime.getManifest()` | content script |
| `menu/options.js` | 3,5,9 | `chrome.storage.sync.set/get` ×3 | popup |
| `events.js` | 31,100 | 僅出現在**註解**中，無實際呼叫 | content script |
| `injected.js` | — | 無（僅標準 DOM API） | page context |

> `events.js` 與 `injected.js` **不需要**任何 `chrome.*` 改動。

------------------------------------------------------------------------

## 移植策略 Approach

1.  **先在這個 repo 完成所有「網頁擴充功能原始碼」的修改（Phase A）。**
    這部分純粹是檔案編輯，**Claude Code 可以全部完成**，每個 Step 結束後
    commit + push。
2.  **再在 Mac 上用 Apple 的 `safari-web-extension-converter`
    把改好的原始碼 轉成 Xcode 專案（Phase B）。** 這部分需要 Mac +
    Xcode + Apple Developer 帳號，**必須由你手動完成**，Claude Code
    無法執行（沒有 Xcode、無法開 Simulator、無法上傳 App Store）。

### `browser.*` 相容性策略決定

Safari 原生同時支援 `chrome.*` 與 `browser.*` 命名空間，但為了： - 與
Mozilla / Chrome 的 promise-based API 行為一致 - 未來可跨瀏覽器維護

我們採用 **Mozilla `webextension-polyfill`**： - content scripts 與
popup：在 `js` 陣列 / `<script>` 最前面載入
`libs/browser-polyfill.min.js`，之後把所有 `chrome.*` 改成
`browser.*`。 - service worker（`"type": "module"`）：polyfill 不是 ES
module，較難 import； service worker 內 **直接使用 Safari 原生的
`browser.*`** 即可（Safari 16+ 原生支援），不需 polyfill。

> 這比「全域 find-replace」更安全，因為 storage callback 在 Safari
> 上若用 promise 形式行為更一致。

**需求 Requirements：** - 一台安裝 Xcode 13+（建議 15+）的 Mac - 用於
App Store 發佈的 Apple Developer 帳號（\$99/年）—— 若只做研究內測，
TestFlight 即可 - 這個 repo（已改好的原始碼）作為轉換來源

------------------------------------------------------------------------

## 執行方式總覽（每個 Step = 一個新 Session → push）

| Phase | Step | 標題 | 誰執行 | 難度 | 複雜度 | 建議模型 |
|----|----|----|----|----|----|----|
| A | 1 | 清理 repo + 加入 polyfill | 🤖 Claude | 低 | 低 | Haiku 4.5 |
| A | 2 | 修改 manifest.json | 🤖 Claude | 低 | 低 | Haiku 4.5 |
| A | 3 | content script `chrome.*`→`browser.*` | 🤖 Claude | 低 | 中 | Sonnet 4.6 |
| A | 4 | service_worker.js 改寫 + alarms fallback | 🤖 Claude | 中 | 中 | Sonnet 4.6 |
| A | 5 | popup（options.js）改寫 + 全面驗證 | 🤖 Claude | 中 | 中 | Sonnet 4.6 |
| B | 6 | 安裝環境 + 跑 converter | 🧑 你（手動） | 中 | 中 | （Claude 從旁協助） |
| B | 7 | Xcode 專案設定（bundle id、簽章） | 🧑 你（手動） | 中 | 中 | （Claude 從旁協助） |
| B | 8 | Simulator / 實機測試 | 🧑 你（手動） | 中 | 高 | （Claude 協助 debug） |
| B | 9 | TestFlight / App Store 發佈 | 🧑 你（手動） | 中 | 中 | — |

> 模型選擇原則：純機械式編輯 →
> **Haiku**；需要理解程式邏輯、跨檔案一致性、 寫 fallback 邏輯 →
> **Sonnet**；若某步驟測試時遇到難解的 runtime bug 再臨時 升級
> **Opus**。

------------------------------------------------------------------------

# Phase A — 原始碼修改（Claude Code 執行）

> 每個 Step 都在這個 repo 內完成，結束後：
> `git add -A && git commit && git push`

------------------------------------------------------------------------

## Step 1 — 清理 repo 並加入 webextension-polyfill

**誰執行：🤖 Claude Code** **難度：低　複雜度：低　建議模型：Haiku 4.5**

要做的事： 1. 刪除無用檔案：`injected.bk`、`libs/.client.js.swp`。 2.
下載 Mozilla `webextension-polyfill` 的壓縮版，存成
`libs/browser-polyfill.min.js`
（來源：<https://unpkg.com/webextension-polyfill/dist/browser-polyfill.min.js>）。
3. 確認檔案大小 / 內容正確（非 HTML 錯誤頁）。

**給 Claude 的 Prompt：** \> 「閱讀 PortingPlan.MD 的 Step 1。刪除 repo
內的 `injected.bk` 與 \> `libs/.client.js.swp`。然後從 \>
`https://unpkg.com/webextension-polyfill/dist/browser-polyfill.min.js`
\> 下載 webextension-polyfill 並存成 `libs/browser-polyfill.min.js`， \>
確認下載到的是合法 JS（不是 HTML 錯誤頁）。完成後做一個 git commit， \>
訊息為 `chore: clean repo and add webextension-polyfill`。」

**驗收：** `libs/browser-polyfill.min.js` 存在且為合法
JS；兩個垃圾檔已刪除。

------------------------------------------------------------------------

## Step 2 — 修改 manifest.json

**誰執行：🤖 Claude Code** **難度：低　複雜度：低　建議模型：Haiku 4.5**

要做的事（編輯 `manifest.json`）： 1. 在 `content_scripts[].js`
陣列**最前面**加入
`"libs/browser-polyfill.min.js"`（必須先於其他腳本載入）。 2. 在
`web_accessible_resources` 確認 `injected.js` 仍在（已存在，保持）。 3.
加入 Safari 專屬設定：
`json    "browser_specific_settings": {      "safari": { "strict_min_version": "15.4" }    }`
4. （popup）`menu/options.html` 也要在最上方載入 polyfill —— 這在 Step 5
處理 HTML，這裡只動 manifest。

**給 Claude 的 Prompt：** \> 「閱讀 PortingPlan.MD 的 Step 2。修改
`manifest.json`：在 \> `content_scripts[].js` 陣列最前面加入
`libs/browser-polyfill.min.js`； \> 加入
`browser_specific_settings.safari.strict_min_version = "15.4"`。 \>
不要改動 matches / permissions。完成後 commit，訊息 \>
`feat: adjust manifest.json for Safari`。」

**驗收：** `manifest.json` 為合法 JSON；polyfill 為 js 陣列第一項；有
safari 設定。

------------------------------------------------------------------------

## Step 3 — content script 的 `chrome.*` → `browser.*`

**誰執行：🤖 Claude Code** **難度：低　複雜度：中（跨 3
個檔案）　建議模型：Sonnet 4.6**

要改的檔案（content script context）： -
`launcher.js`：`chrome.storage.sync.get`（L4）、`chrome.runtime.getURL`（L39） -
`logic.js`：`chrome.storage.sync.set` ×4（L76,80,85,86） -
`libs/client.js`：`chrome.runtime.getManifest()`（L5）

全部 `chrome.` → `browser.`。因為 polyfill 已在 Step 2 載入，promise
行為一致； 但本專案原本用 callback 形式，**保留 callback
形式即可**（polyfill 同時支援 callback 與 promise），不需重寫成
async/await，降低風險。

**給 Claude 的 Prompt：** \> 「閱讀 PortingPlan.MD 的 Step 3。把
`launcher.js`、`logic.js`、 \> `libs/client.js` 裡所有實際的 `chrome.*`
呼叫改成 `browser.*`（保留原本的 \> callback 寫法，不要改成
async/await）。不要動到註解。改完用 grep 確認這三個 \> 檔案已無
`chrome.` 字樣（註解除外）。commit 訊息 \>
`refactor: chrome.* -> browser.* in content scripts`。」

**驗收：** `grep -rn "chrome\." launcher.js logic.js libs/client.js`
只剩註解或無結果。

------------------------------------------------------------------------

## Step 4 — service_worker.js 改寫 + alarms fallback

**誰執行：🤖 Claude Code** **難度：中　複雜度：中　建議模型：Sonnet
4.6**

要做的事（編輯 `service_worker.js`）： 1. 所有 `chrome.*` →
`browser.*`（`runtime.onInstalled`、`tabs.create`、
`alarms.*`、`storage.sync.*`）。service worker 內用 Safari 原生
`browser.*`， **不需** import polyfill。 2. **alarms
fallback**：`browser.alarms` 在 Safari 16.4+ 才支援。若要支援 iOS
15.x，需加保護：
`js    if (typeof browser !== 'undefined' && browser.alarms) {        browser.alarms.create('CheckIfEnabled', { periodInMinutes: 60 });        browser.alarms.onAlarm.addListener(...);    } else {        // 較舊 Safari：service worker 內用 setInterval 作為退路        setInterval(checkIfEnabled, 60 * 60 * 1000);    }`
把現有的「檢查 is_enabled」邏輯抽成一個具名函式
`checkIfEnabled()`，讓兩條 路徑都能呼叫。

**給 Claude 的 Prompt：** \> 「閱讀 PortingPlan.MD 的 Step 4。改寫
`service_worker.js`：(1) 全部 \> `chrome.*` 改成 `browser.*`；(2) 把
alarm 內檢查 is_enabled 的邏輯抽成具名 \> 函式 `checkIfEnabled()`；(3)
用 `typeof browser.alarms` 判斷，支援時用 \> `browser.alarms`，不支援時
fallback 用 `setInterval` 每小時呼叫 \> `checkIfEnabled()`。保持原本的
server_url 與 fetch 流程。commit 訊息 \>
`refactor: port service worker to browser.* with alarms fallback`。」

**驗收：** `service_worker.js` 無 `chrome.` 呼叫；有 `checkIfEnabled`
函式與 fallback 分支；為合法 JS（`node --check service_worker.js`，若無
import 才適用）。

------------------------------------------------------------------------

## Step 5 — popup（options.js）改寫 + 全面驗證

**誰執行：🤖 Claude Code** **難度：中　複雜度：中　建議模型：Sonnet
4.6**

要做的事： 1. `menu/options.js`：`chrome.storage.sync.*` ×3 →
`browser.storage.sync.*`。 2. `menu/options.html`：在所有其他 `<script>`
之前加入 `<script src="../libs/browser-polyfill.min.js"></script>`
（確認相對路徑正確 —— options.html 在 `menu/` 下，polyfill 在
`libs/`）。 3. **全 repo 最終驗證**：`grep -rn "chrome\."`
確認除了註解與第三方 lib （jquery / timeme）外，已無任何 `chrome.*`
實際呼叫。

**給 Claude 的 Prompt：** \> 「閱讀 PortingPlan.MD 的 Step 5。把
`menu/options.js` 的 `chrome.storage.*` \> 改成 `browser.storage.*`；在
`menu/options.html` 最上方（其他 script 之前） \> 加入 browser-polyfill
的 `<script>`（注意相對路徑 `../libs/`）。然後在整個 \> repo 跑 grep
確認除了註解與 jquery/timeme 之外已無 `chrome.` 呼叫，把結果 \>
回報給我。commit 訊息
`refactor: port popup to browser.* and finalize`。」

**驗收：** `grep -rn "chrome\." . --include=*.js --include=*.html`（排除
jquery/timeme/註解）無結果；popup HTML 有載入 polyfill。

------------------------------------------------------------------------

> ✅ **Phase A 完成後，這個 repo
> 就是一份「Safari-ready」的網頁擴充功能原始碼。** 接下來進入 Mac/Xcode
> 階段。

------------------------------------------------------------------------

# Phase B — Xcode / App Store（你手動執行）

> ⚠️ 這些步驟 **Claude Code 無法代為執行**：需要 macOS GUI、Xcode、iOS
> Simulator、Apple Developer 帳號。Claude
> 可以從旁「解釋指令、解讀錯誤訊息、 幫你 debug
> JS」，但實際操作要由你完成。
>
> 注意：converter 會把原始碼**複製**進一個新的 Xcode
> 專案資料夾。從這一步開始， 「真正會被編譯的程式碼」是在 Xcode
> 專案裡那一份。若 Phase A 的程式碼日後有 修改，需要重新跑
> converter，或手動同步到 Xcode 專案內的 extension 資料夾。
> **建議：把產生的 Xcode 專案也納入版本控制（可放在這個 repo
> 的子目錄或另開 一個 repo）。**

------------------------------------------------------------------------

## Step 6 — 安裝環境並執行 converter

**誰執行：🧑 你（手動）。Claude 可協助解讀輸出。**
**難度：中　複雜度：中**

1.  確認已安裝 Xcode（App Store 安裝），並執行一次
    `xcode-select --install` 安裝 command line tools。

2.  在 repo 根目錄執行（注意：來源路徑就是 repo 根目錄 `.`，**不是**
    `Frontend/`）：

    ``` bash
    xcrun safari-web-extension-converter . \
      --project-location ./SafariExtension \
      --app-name "ThreadsFilter" \
      --bundle-identifier edu.ntu.psy.mil.ThreadsFilter \
      --swift
    ```

3.  converter 會產生 `./SafariExtension/ThreadsFilter/`，內含：

    -   一個原生 iOS/macOS app wrapper
    -   內嵌的擴充功能（已複製 manifest.json 與所有資源）

4.  留意 converter 的 warning（常見：unsupported manifest
    key），記下來， 下一步若編譯失敗可回頭處理。

**給 Claude 的協助 Prompt（可選）：** \> 「我在 Mac 上跑了
PortingPlan.MD Step 6 的 converter，這是它的輸出與 \>
warning：<貼上>。幫我判斷哪些 warning 需要處理、怎麼處理。」

------------------------------------------------------------------------

## Step 7 — Xcode 專案設定（簽章、bundle id）

**誰執行：🧑 你（手動）** **難度：中　複雜度：中**

1.  開啟 `./SafariExtension/ThreadsFilter/ThreadsFilter.xcodeproj`。
2.  對 **App target** 與 **Extension target** 兩者：
    -   設定 **Team**（你的 Apple Developer 帳號）。
    -   確認 bundle identifier（App：`edu.ntu.psy.mil.ThreadsFilter`，
        Extension 會是 `...ThreadsFilter.Extension` 之類）。
    -   開啟 **Automatically manage signing**。
3.  確認 Extension target 的 Deployment Target 設為 iOS 15.4（與
    manifest 一致）。
4.  確認資源（icons、libs、menu、static）都有被加進 Extension target 的
    *Copy Bundle Resources*。

------------------------------------------------------------------------

## Step 8 — Simulator / 實機測試

**誰執行：🧑 你（手動）。Claude 可協助解讀 console error / debug JS。**
**難度：中　複雜度：高（最容易出問題的一步）**

1.  在 Xcode 選 iPhone Simulator（iOS 15.4+），Run App target。
2.  在 Simulator 的 **設定 \> Safari \> 擴充功能** 啟用
    ThreadsFilter，並允許在 `threads.net` / `threads.com` /
    `mil.psy.ntu.edu.tw` 上執行。
3.  開 Safari 前往 threads.net，登入，捲動動態。
4.  用 **macOS Safari 的「開發」選單 → 連到 Simulator** 來看 Web
    Inspector console。
5.  驗證項目：
    -   feed 被過濾（`/get_feed` 有被呼叫）
    -   console 有事件 log（`PostVisible`、`LikePost`、`FeedRequest`
        等）
    -   banner 在達到 `posts_count` 門檻時出現
    -   後端 `mil.psy.ntu.edu.tw` 收到 `/get_feed` 與 `/event` 請求
    -   service worker 的每小時 health check 能更新 enabled 狀態
6.  **常見問題：**
    -   `injected.js` 注入失敗 → 檢查 `web_accessible_resources` 與
        `browser.runtime.getURL` 是否正常回傳 URL。
    -   `browser` undefined → 確認 polyfill 是 content_scripts / popup
        的第一個檔。
    -   CORS / 混合內容 → 後端需支援 HTTPS（已是 https，應 OK）。

**給 Claude 的協助 Prompt（可選）：** \> 「Safari Web Inspector 在
threads.net 上出現這些錯誤：<貼上 console>。 \> 對照 PortingPlan.MD
與我們的 injected.js / launcher.js，幫我找原因。」

------------------------------------------------------------------------

## Step 9 — TestFlight / App Store 發佈

**誰執行：🧑 你（手動）** **難度：中　複雜度：中**

1.  Xcode `Product > Archive`。
2.  上傳到 App Store Connect。
3.  **研究用途建議走 TestFlight**：beta 測試最多 10,000
    名使用者，外部測試需要 一次輕度審查，但比正式上架快很多。把
    TestFlight 連結發給受試者即可。
4.  若要正式上架 App
    Store：需通過完整審查（提供隱私政策、說明擴充功能用途、 資料蒐集揭露
    —— 本擴充功能會蒐集瀏覽事件，務必在 App Privacy 中誠實揭露）。

------------------------------------------------------------------------

## 可行性評估 Feasibility

| 面向 | 評估 |
|----|----|
| XHR/Fetch hooking | ✅ 可行 —— injected.js 注入頁面 context 的模式在 Safari 有效 |
| `chrome.*` API 相容 | ✅ polyfill + `browser.*` 即可，已盤點全部呼叫點 |
| Service worker | ✅ Safari 16+ 支援 MV3 service worker |
| alarms API | ⚠️ 僅 Safari 16.4+；iOS 15 需 setInterval fallback（Step 4 已處理） |
| App Store 發佈 | ⚠️ 需 Apple Developer 帳號 + 審查（研究內測走 TestFlight） |
| 需要 Mac + Xcode | ⚠️ 無法在 Linux/Claude 端建置 iOS app；最終建置必須在 Mac |

**整體：可行。預估工時：Phase A 約 0.5 天（Claude 協助可更快）+ Phase B
0.5–1 天 + App Store 審查時間。**

------------------------------------------------------------------------

## 最終驗證清單 Verification

1.  iOS Simulator 載入擴充功能，開 threads.net 捲動 → 貼文被過濾
2.  console 有事件 log（PostVisible、LikePost 等）
3.  後端 `mil.psy.ntu.edu.tw` 確認收到 `/get_feed` 與 `/event` 請求
4.  banner 在正確的貼文門檻出現
5.  每小時 health check 觸發並更新 enabled 狀態
6.  popup（點擊工具列圖示）能開啟、`show_scores` 開關能存進 storage
