<!-- markdownlint-disable MD041 -->
<!-- Title format 標題格式: [Area] short description -->
<!-- Area: Core, Docs, Deploy, LINE, Redis -->

## Summary 摘要

One or two sentences on what this PR does and why.
一到兩句話說明這個 PR 做了什麼、為什麼要做。

## Changes 變更內容

- Bullet list of what changed
- 條列式列出變更項目

## Testing Done 測試方式

How you verified this works (commands run, scenarios tested).
如何驗證這個變更確實可行（執行過的指令、測試過的情境）。

## Related Issue 相關 Issue

Closes #123 (if applicable)
Closes #123（若適用）

## Before Requesting Review 送出審查前

- [ ] Ran `node --check` on all changed `.js` files, or equivalent local test scripts (`npm run test:rotation`, `npm run test:db`)
      對所有變更的 `.js` 檔案執行過 `node --check`，或對應的本機測試指令
- [ ] Tested against the local test group, not the production household group, unless the change specifically requires prod testing
      在本機測試群組而非正式的室友群組中測試過，除非此變更確實需要在正式環境測試
- [ ] `.env` / `.env.production` values were not committed
      沒有把 `.env` 或 `.env.production` 的內容提交進版本控制
