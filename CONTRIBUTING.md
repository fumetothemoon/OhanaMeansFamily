# Contributing to OhanaMeansFamily

## Labels 標籤說明

| Label           | Use for                                                                                             | 用於                                                            |
| --------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `bug`           | Something is broken or behaving incorrectly                                                         | 功能損壞或行為不正確                                            |
| `enhancement`   | A new feature or capability that doesn't exist yet                                                  | 尚未存在的新功能或新能力                                        |
| `refactor`      | Restructuring existing code with no behavior change                                                 | 重整現有程式碼結構，行為不變                                    |
| `chore`         | Maintenance work that isn't a feature/bug/refactor (dependency bumps, CI config, renaming, cleanup) | 非功能/錯誤/重構的維護工作（套件更新、CI 設定、重新命名、清理） |
| `documentation` | Adding or improving docs (README, comments, guides)                                                 | 新增或改善文件（README、註解、指南）                            |
| `question`      | Requesting clarification, not a concrete change                                                     | 需要進一步釐清，非具體變更                                      |
| `duplicate`     | Already tracked by another issue/PR                                                                 | 已有其他 issue/PR 追蹤同樣的事                                  |
| `invalid`       | Not a real issue as filed (wrong repo, not reproducible, etc.)                                      | 提出的內容不成立（誤觸、無法重現等）                            |
| `wontfix`       | Acknowledged but intentionally not being addressed                                                  | 已知悉但不會處理                                                |

---

## Reporting a Bug 回報問題

**Title format 標題格式:**

```
[Area] short description
```

e.g. `[Core] weekly kickoff message sends duplicate replies`
例如：`[Core] 週一提醒訊息重複發送`

**Required sections in the issue body 內文須包含以下區塊:**

```markdown
## Steps to Reproduce 重現步驟

1. ...
2. ...

## Expected Behavior 預期行為

What should have happened.
應該發生的結果。

## Actual Behavior 實際行為

What actually happened instead.
實際發生的結果。

## Environment 環境

- Local dev / Production 本機測試 / 正式環境:
- Node version (if local) Node 版本（若為本機）:
- Relevant log output 相關的錯誤訊息或 log:
```

---

## Submitting a Pull Request 提交 PR

**Title format 標題格式:** same convention as issues 與 issue 相同的命名慣例

```
[Area] short description
```

**Required sections in the PR description PR 說明須包含以下區塊:**

```markdown
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
```

**Before requesting review 送出審查前:**

- [ ] Ran `node --check` on all changed `.js` files, or equivalent local test scripts (`npm run test:rotation`, `npm run test:db`)
      對所有變更的 `.js` 檔案執行過 `node --check`，或對應的本機測試指令
- [ ] Tested against the local test group, not the production household group, unless the change specifically requires prod testing
      在本機測試群組而非正式的室友群組中測試過，除非此變更確實需要在正式環境測試
- [ ] `.env` / `.env.production` values were not committed
      沒有把 `.env` 或 `.env.production` 的內容提交進版本控制
