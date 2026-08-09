# 租賃住宅管理人員練習工具

[![Tests](https://github.com/MuChengTechnology/rent-manager/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/MuChengTechnology/rent-manager/actions/workflows/tests.yml)

以靜態題庫 JSON 提供全題練習、章節練習、錯題回顧與初訓模擬考的前端網站。根目錄先選擇訓練類型：`/init` 是初訓，`/renew` 是換證；再選擇「有詳解題庫」或「只有答案題庫」。兩條路徑的題庫選擇、進行中 session 與本機學習紀錄完全獨立。

本工具是由**沐承科技有限公司**提供的公開免費服務；原創程式碼於 [MuChengTechnology/rent-manager](https://github.com/MuChengTechnology/rent-manager) 公開，並採用 [MIT License](LICENSE) 授權。官方題庫與第三方內容不因本專案授權而改變其權利歸屬。

## 先備條件

- Node.js（建議使用目前仍受支援的 LTS 版本）
- npm（隨 Node.js 安裝）

確認版本：

```bash
node --version
npm --version
```

## 本機啟動

Clone 專案後，在專案根目錄直接執行：

```bash
npm ci
npm run dev
```

本機開發不需要設定環境變數。終端機會顯示實際來源網址；路由如下：

| 路徑 | 功能 |
|---|---|
| `/` | 選擇初訓或換證題庫 |
| `/init/`、`/renew/` | 選擇該訓練類型的有詳解或只有答案題庫，並續作或放棄該類型進度 |
| `/init/practice`、`/renew/practice` | 全題庫隨機單題練習 |
| `/init/practice/chapter`、`/renew/practice/chapter` | 選擇實際存在的章節後隨機或依題號順序練習 |
| `/init/mock` | 初訓 120 分鐘、十章各隨機抽十題模擬考與歷史章節正確率 |
| `/init/wrong`、`/renew/wrong` | 作答統計、實際章節的歷史答錯率與指定章節錯題練習 |
| `/about/` | 唯一 canonical 的「關於本站」頁面，集中說明兩種題庫的資料來源、功能說明與免責聲明 |

換證題庫目前有 379 題、實際為第 1 至第 3 章；換證模擬考刻意延後，網站不提供連結且不會產生 `/renew/mock/`。舊版 `/practice`、`/practice/chapter`、`/mock` 與 `/wrong` 仍保留相容 redirect 到對應的 `/init` 路由。About 只由 `/about/` 提供，不建立訓練類型專屬路徑。

題庫選擇保存在目前瀏覽器的 `localStorage`，關閉並重新開啟網站或已安裝的 Web App 後，仍會使用先前選擇的題庫。可隨時由頁首的「更換題庫」返回入口重選。

## 常用指令

```bash
# 單元測試
npm test

# Desktop 與 Mobile E2E
npm run test:e2e

# 型別與 Astro 檢查
npm run typecheck

# 產生靜態檔案（輸出至 dist/）
npm run build

# 預覽建置結果
npm run preview
```

## 靜態部署

本專案固定使用網站根目錄路由。正式 production canonical 為 `https://cert.muchengtech.com`；`rent-cert.muchengtech.com` 是為未來其他證照服務預留的 alias，頁面 canonical 仍應指向正式網址。

靜態託管平台可使用：

- **Build command**：`npm run build`
- **Build output directory**：`dist`

### 搜尋引擎與爬蟲

正式 crawler contract 由 `public/robots.txt` 與 `public/sitemap.xml` 版本化管理：

- Sitemap 只列出 `/`、`/init/`、`/renew/`、`/about/` 四個可獨立理解的入口頁。
- 練習、章節、模擬考與錯題頁會輸出 `noindex,follow`；爬蟲可讀取該指令，但不應將依賴本機狀態的頁面列入搜尋結果。
- `/api/` 與 `/data/` 不屬於可索引頁面，`robots.txt` 會要求標準爬蟲不要抓取；靜態 `/data/*` 回應另加 `X-Robots-Tag`。
- 舊版 `/practice*`、`/mock/`、`/wrong/` 由 Worker 永久 301 至對應的 `/init/.../` canonical；不存在路徑使用 branded `404.html` 並標示 `noindex,nofollow`。
- Canonical、Open Graph、Twitter Card 與 sitemap URL 一律使用 `https://cert.muchengtech.com`，alias 不建立另一套索引。`rent-cert.muchengtech.com` 仍應在 Cloudflare 設定單跳 301，並保留原 path 與 query。

`robots.txt` 只是對善意爬蟲的指示，**不是安全或權限控制**。不得將 credential、個資或其他機密資料放進 `public/`、再依賴 `Disallow` 隱藏。

### 站內問題回報設定

站內表單與 GitHub Issues 會同時保留；前者方便非開發背景的使用者，後者仍是公開追蹤與開發協作管道。部署設定分成三類：

| 名稱 | 設定位置 | 用途 |
|---|---|---|
| `PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare build-time public variable | Turnstile 公開 Site Key；Astro build 時必須存在 |
| `FORM_ALLOWED_ORIGIN` | `wrangler.jsonc` 的 `vars` | 允許提交表單的精確 origin allowlist；多個值以逗號分隔 |
| `FORM_SENDER` | `wrangler.jsonc` 的 `vars` | Email Service 已允許的固定系統寄件者 |
| `REPORT_MAIL` | `wrangler.jsonc` 的 `vars` | 接收問題回報的固定信箱 |
| `TURNSTILE_SECRET_KEY` | Worker secret | 僅供 Worker 驗證 Turnstile，不可寫入原始碼或 `wrangler.jsonc` |
| `REPORT_EMAIL` | `wrangler.jsonc` 的 `send_email` binding | 綁定固定收件者的 Email Service binding；名稱須與 Worker 的 `env.REPORT_EMAIL` 一致 |

`wrangler.jsonc` 是 runtime variables 與 Email binding 的版本化 source of truth。目前已版本化正式 `FORM_ALLOWED_ORIGIN`、`FORM_SENDER`、`REPORT_MAIL` 與 `REPORT_EMAIL.destination_address`；日後變更收件信箱時，必須讓 `REPORT_EMAIL.destination_address` 與 `REPORT_MAIL` 保持完全一致。`tests/config.test.mjs` 會驗證欄位與限制設定不再漂移。

`TURNSTILE_SECRET_KEY` 仍須透過 Cloudflare secret 管理，不得 commit；`PUBLIC_TURNSTILE_SITE_KEY` 必須設在 Cloudflare build environment，因為 Wrangler runtime variable 不會回填已完成的 Astro browser bundle。缺少任一必要設定或 Email binding 時，API 會回傳 `service_unavailable` 並維持 fail closed；前端只會告知回報未送出並保留填寫內容，不會顯示 Site Key、binding 或其他部署細節。此版本不使用額外的 Rate Limit binding。

若 `rent-cert.muchengtech.com` 只會重新導向正式站，設定 `FORM_ALLOWED_ORIGIN=https://cert.muchengtech.com` 即可。若兩個網域都會直接載入網站並提交表單，設定：

```text
FORM_ALLOWED_ORIGIN=https://cert.muchengtech.com,https://rent-cert.muchengtech.com
```

每一項都必須是完整且精確的 `http`／`https` origin，不接受 path、空項目、重複項目或 `*.muchengtech.com` 萬用字元。Worker 也會要求 Turnstile 回傳的 hostname 與該次 request origin 對應。

表單使用同頁 `<dialog>`，會預填目前的初訓／換證、題庫版本、練習分類（全題隨機、章節、模擬考或錯題）、章節、目前顯示第幾題與頁面，但使用者仍可修改。內部題目識別碼只會隱藏附帶，不會顯示為一般使用者欄位。附圖限一張 PNG、JPEG 或 WebP，最大 1 MiB；前端與 Worker 都會驗證格式及大小。


## 練習紀錄與重設

作答紀錄、錯題資料與模擬考結果分布儲存在目前瀏覽器的 `localStorage`，不會自動同步到其他裝置或瀏覽器。資料採 version 2 schema；舊版無版本資料會安全遷移，損壞資料或未知版本則採 fail-safe 預設值。進行中的練習與模擬考仍沿用相容的 session version 1，可在網站更新後直接續作；新建立的模擬考 session 會額外保存每題的 A–D 原始代號排列（不保存題目或選項文字），讓 reload 後維持相同選項與答案。只有題庫內容或共用題目註記實際改變、使原題序不再可靠時，舊 session 才會安全失效。

每次模擬考會保存 attempt ID、交卷時間、題庫類型、總分、十章的總題數／作答數／答對數，以及該次答錯或未作答題目的穩定 key、原始／畫面選項代號與單題內容指紋。歷史回顧只會在目前題庫內容與指紋一致時安全還原題目、作答選項、正確選項與說明；不保存完整題目文字、四個選項內容或整份題序，舊紀錄仍可查看章節統計但不會虛構逐題作答，題庫內容更新時也不會混用新題目與舊作答。最多保留最近 50 次結果。`/mock` 的「清除模擬考紀錄」只會清除結果分布與該次錯題回顧，不影響錯題與累計作答；`/wrong` 的「重設本機紀錄」則會清除全部本機學習紀錄。也可在瀏覽器開發者工具的 **Application／儲存空間** 清除網站資料。

## 題庫來源與 Source of Truth

官方下載來源：

- [租賃住宅管理人員測驗題庫｜中華民國租賃住宅服務商業同業公會全國聯合會](https://rentalh.org.tw/down-list2.php?lmenuid=12&mpmid=2)
- 來源頁提供「租賃住宅管理人員資格訓練題庫(全科目不含法源依據)115.02.06更新版」與「租賃住宅管理人員資格訓練題庫(全科目含法源依據)115.02.06更新版」兩份檔案。
- 初訓題庫：官方更新日期 **2026-02-06**；本站最後更新／轉檔日期 **2026-07-21**；Runtime 兩個版本各 **966 題**。
- 換證題庫：官方更新日期 **2026-02-06**；本站最後更新／轉檔日期 **2026-08-03**；Runtime 兩個版本各 **379 題**。
- 網站 `/about` 集中說明資料來源、模擬考規則與免責聲明；題庫僅供個人學習及測驗練習使用，內容仍應以官方最新公告為準。

使用者確認的 corrected 原始來源位於 `source-data/`，不可由轉換程式直接覆寫：

- `source-data/questions_with_law_corrected.json`
- `source-data/questions_without_law_corrected.json`

網站實際載入的是 `public/data/` 的 Runtime 複本：

- `public/data/questions_with_law.json`
- `public/data/questions_without_law.json`

Runtime 題庫必須與 corrected 原檔逐 byte 相同；`npm test` 會驗證兩份題庫均為 966 題、keys／題目／選項／答案一致，並確認法源欄位只存在於 with-law 版本。

實際課程確認的「可忽略題」與官方題目錯字，統一維護在共用 sidecar：

- `public/data/question_annotations.json`

sidecar 以穩定的 `question_key` 同時對應有詳解與只有答案題庫；`ignore` 題不納入模擬考，但仍保留於全題與章節練習並顯示提示；`typo` 題保留 corrected／Runtime JSON 的官方原文，只在畫面依 `question_replacement` 加上括號修正。PDF converter 不會產生或覆寫這份人工註記。`npm test` 會驗證 key 唯一、替換片段可安全套用，且三題註記同時符合兩套題庫。

`.rebuilt.json` 及其他轉換中間產物只能作為比對候選，不得直接成為網站出題來源。更新題庫時應先逐題檢查與 corrected 的 semantic diff，人工確認後才同步至 `source-data/` 與 `public/data/`。

## 從官方 PDF 產生候選 JSON

`scripts/convert_rental_exam_pdf.py` 讀取「含法源依據」官方 PDF，輸出符合目前 schema 的兩份候選 JSON；without-law 版本會由 with-law 版本移除 `law_reference` 產生，確保兩者 keys、題目、選項及答案一致。

### 推薦：使用 uv 隔離執行

不需安裝 Python 套件至全域環境：

```bash
env -u PYTHONPATH uv run --isolated --python 3.11 --with pdfplumber==0.11.8 \
  python scripts/convert_rental_exam_pdf.py \
  "/path/to/official-with-law.pdf" \
  --expected-count 966
```

預設輸出至目前目錄：

- `questions_with_law.rebuilt.json`
- `questions_without_law.rebuilt.json`

也可明確指定輸出位置：

```bash
env -u PYTHONPATH uv run --isolated --python 3.11 --with pdfplumber==0.11.8 \
  python scripts/convert_rental_exam_pdf.py \
  "/path/to/official-with-law.pdf" \
  --with-law /tmp/questions_with_law.rebuilt.json \
  --without-law /tmp/questions_without_law.rebuilt.json \
  --expected-count 966
```

### 使用 Python venv

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r scripts/requirements-pdf-converter.txt
python scripts/convert_rental_exam_pdf.py \
  "/path/to/official-with-law.pdf" \
  --expected-count 966
```

### Converter regression tests

```bash
env -u PYTHONPATH uv run --isolated --python 3.11 --with pdfplumber==0.11.8 \
  python -m unittest scripts/test_convert_rental_exam_pdf.py
```

Converter 會 fail closed 驗證：

- 預設必須為 966 題；只有明確提供正整數 `--expected-count` 才能調整預期題數
- 第一章至第十章必須全部存在
- chapter／section number 與中文 code 一致
- 題目 key 不重複、各節題號連續
- 每題必須恰有依序 A、B、C、D 四個非空選項；重複或錯序 marker 直接拒絕，不會自動改寫
- answer 必須為 A–D 且不得為空
- with-law 每題法源不得為空
- 官方第十章無 subsection 時正規化為第一節「專業倫理規範」

為避免誤覆寫：

- 任一輸出檔已存在時，預設拒絕寫入。
- 只有明確加入 `--force` 才會更新既有候選檔；程式會先寫入並同步 temp files，再以 backup＋rollback 安裝兩份配對輸出，任一安裝失敗會恢復兩份舊檔。
- 輸出檔名若以 `_corrected.json` 結尾，仍會拒絕執行。雖可用 `--allow-corrected-overwrite` 明確解除名稱保護，但正常流程不應使用；請輸出 `.rebuilt.json` 後再做 semantic diff 與人工審查。

## 問題回報

若發現題目、答案、法源、畫面顯示問題或有功能建議，可使用網站內的浮出式問題回報表單；不熟悉 GitHub 的使用者不需要離開目前頁面。表單會顯示並預填練習分類、章節、目前第幾題與題庫版本，送出內容可包含一張已遮蔽個人資料的圖片。

[GitHub Issues](https://github.com/MuChengTechnology/rent-manager/issues/new) 仍會永久保留，方便公開追蹤與開發協作。兩種管道都請勿提供密碼、證件、付款資料或其他敏感個資。

安全漏洞、疑似憑證或濫用方式請勿提交至公開 Issue；請依 [Security Policy](.github/SECURITY.md) 使用私人通報管道。

## 授權

本專案原創程式碼採用 [MIT License](LICENSE) 授權。官方題庫、法源與其他第三方內容的權利仍歸原發布單位或權利人所有，不因本專案的 MIT License 而改變。
