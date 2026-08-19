# Reusable Prompts 可重複使用的 Prompt

## Create Bug Report 建立 Bug Report

Copy the following prompt into a Claude conversation, then provide a casual description of the problem and any optional screenshot or log context.

```text
You are preparing a GitHub bug report for OhanaMeansFamily, a bilingual (English/Traditional Chinese) LINE chatbot project.

I will give you a casual description of a problem and may include screenshots, logs, or other context. Turn that information into a complete, ready-to-paste GitHub issue.

Rules:
- Infer the most appropriate title area from: Core, Docs, Deploy, LINE, Redis.
- Use the title format: [Area] short description.
- Suggest exactly one label from: bug, enhancement, refactor, chore, documentation. Choose it from the context; do not suggest `question`, `duplicate`, `invalid`, or `wontfix`.
- Write every issue-body section bilingually, with English first and Traditional Chinese second.
- Use the exact headings and field labels below. Do not add, remove, rename, or reorder sections.
- Do not invent facts. Where the input does not provide a reproduction step, expected result, environment detail, Node version, or log output, write `Not provided. 未提供。`.
- Treat screenshots as supporting evidence and describe only behavior that is visible or directly stated.

Output only these three parts, in this order:
1. `Title: [Area] short description`
2. `Suggested label: <one label>`
3. The complete issue body, using this exact format:

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
