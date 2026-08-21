---
name: create_new_issue
description: "Draft and create a GitHub bug report or feature request from a description and optional screenshots."
argument-hint: "Required: simple issue description. Optional: attach one or more screenshots."
agent: agent
---

# Create New Issue 建立新 Issue

Create a GitHub issue from the required prompt argument. Treat every image attached to this chat as optional screenshot evidence. Do not create or update an issue until the user explicitly approves the final draft.

1. Read [CONTRIBUTING.md](../../CONTRIBUTING.md), [bug report template](../ISSUE_TEMPLATE/bug_report.yml), and [feature request template](../ISSUE_TEMPLATE/feature_request.yml). Analyze the description and screenshots together. Extract only supported facts; do not invent reproduction steps, scope, or acceptance criteria.
2. Infer whether this is a bug report or feature request. Default to **Bug report** when the evidence describes broken or incorrect existing behavior; otherwise default to **Feature request**. Infer the most fitting allowed label from the selected template and the label definitions in `CONTRIBUTING.md`.
3. Use the question picker to ask both questions in one interaction. Mark the inferred answers as recommended defaults:
   - **Issue type**: `Bug report` or `Feature request`
   - **Label**: show only labels allowed by the selected issue type. If the user changes the issue type, update the label choices and ask again when the current label is not allowed.
4. Generate a complete draft using the fields and bilingual headings from the user-selected template. Use the title format `[Area] short description`. Include relevant screenshot observations or attachment references in `Additional Context 其他背景資訊` for bugs, or in `Context 背景` for feature requests. For required details not provided, use a clearly marked `Not provided / 未提供` placeholder rather than fabricating information.
5. Present the proposed type, label, title, and full Markdown issue draft. Then use a question picker to ask for one action:
   - **Create issue**: create the issue using the approved title, label, and exact draft body.
   - **Revise draft**: ask focused follow-up questions, revise the draft, and request approval again.
   - **Cancel**: stop without creating or updating anything.
6. Only after the user selects **Create issue**, use the available GitHub issue integration to create the issue with the approved title, label, exact draft body, and `fumetothemoon` assigned by default. Report the created issue number and URL. If issue creation is unavailable or fails, report the blocker and retain the approved draft without retrying destructively.
