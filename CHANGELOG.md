# Changelog

本文件記錄租賃住宅管理人員練習工具的公開版本重大變更。
格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本規則採 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

## [0.1.0] - 2026-08-09

### Added

- 初訓與換證雙軌題庫，可選擇有詳解或只有答案版本。
- 全題、章節與錯題練習；初訓另提供 100 題、120 分鐘模擬考。
- 本機中斷續作、作答統計、章節分析，以及模擬考歷史逐題錯題回顧。
- 可安裝 PWA、離線資源、響應式桌面／行動版介面。
- 站內一般問題回報及公開 GitHub Issues 入口。

### Changed

- 初訓與換證的題庫選擇、session、history 與錯題資料完全隔離。
- 歷史錯題回顧只保存最小 canonical 作答資料，正確答案永遠由目前題庫推導。
- 建立 canonical、sitemap、robots、Open Graph、JSON-LD、404 與舊路由 301 契約。

### Security

- 題庫、註記或本機紀錄不一致時採 fail-closed，不推測舊答案。
- 問題回報驗證 Origin、Turnstile、payload 與附件格式，收件設定由 Worker 控制。
- CI 執行高風險依賴 audit；公開 repository 具安全揭露政策與 Dependabot。
- 安全漏洞或敏感資料須依 [.github/SECURITY.md](.github/SECURITY.md) 私下通報，不得使用站內一般問題回報或公開 GitHub Issues。

### Known limitations

- 換證目前不提供模擬考。
- 學習紀錄只保存在目前瀏覽器，不提供帳號或跨裝置同步。
- 題庫供個人學習與測驗練習，內容仍以官方最新公告為準。
- MIT License 僅適用於本專案原創程式碼，不改變官方題庫或第三方資料的權利歸屬。

[Unreleased]: https://github.com/MuChengTechnology/rent-manager/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/MuChengTechnology/rent-manager/releases/tag/v0.1.0
