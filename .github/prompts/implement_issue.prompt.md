---
name: implement_issue
description: "Use when: implement or fix a GitHub issue from investigation through a validated pull request."
argument-hint: "GitHub issue number or URL, for example: #123"
agent: agent
---

Implement the GitHub issue supplied in `${input:issue:number or URL, for example #123}` for this repository. Work through the following phases in order.

## Authentication preflight

Before fetching the issue, verify GitHub authentication through an available integration. Prefer GitKraken when it is available. If authentication is unavailable or lacks sufficient repository access, explain the required sign-in step and stop before making repository changes. For public issues, a public GitHub page may be used only as a read-only fallback.

## Phase 1: Understand the issue (read-only)

1. Fetch the issue from GitHub, including its title, body, labels, comments, linked pull requests, and any referenced issues.
2. Inspect the repository guidance, especially [CONTRIBUTING.md](../../CONTRIBUTING.md), and check the current Git status and branch.
3. Explore only the relevant code, tests, documentation, configuration, and recent history needed to understand the behavior. Do not create a branch, change files, commit, or open a pull request in this phase.
4. Identify missing details, contradictory requirements, risky assumptions, unrelated changes already in the working tree, and any open pull request that already implements the issue. If an open implementation pull request exists, report it and stop rather than duplicating work.

## Phase 2: Present a plan and wait

Present a concise implementation plan containing:

- Issue: number, title, labels, and a one-sentence problem statement.
- Understanding: observed behavior, intended behavior, and likely root cause or relevant implementation area.
- Scope: files expected to change and why.
- Validation: exact tests, checks, and manual scenarios to run.
- Risks or questions: blockers and assumptions that require confirmation.

Then ask for explicit approval to proceed. Do not create a branch or make any repository changes until the user approves the plan. If clarification is required, ask focused questions and revise the plan before requesting approval again.

## Phase 3: Implement after approval

1. Re-check the working tree. Preserve all pre-existing user changes. If unrelated modifications make a safe implementation or commit impossible, explain the conflict and ask how to proceed.
2. Create a descriptive branch from the latest available remote default branch, not from the currently checked-out branch. Preserve the current branch and do not rewrite history. If a clean branch from the default branch cannot be created without disrupting user changes, explain the conflict and ask how to proceed. Use a lowercase, hyphenated branch name based on the issue, such as `fix/123-weekly-reminder-duplicates` or `feature/123-add-reminder-command`.
3. Implement the smallest complete fix that satisfies the approved plan, following existing repository conventions.
4. Add or update focused tests when the repository has an appropriate test surface. Avoid unrelated refactors.

## Phase 4: Validate and review

1. Run the planned focused tests and checks. For every changed JavaScript file, run `node --check`; also run relevant project scripts such as `npm run test:rotation` or `npm run test:db` when applicable.
2. Review the diff for correctness, regressions, error handling, security concerns, style consistency, accidental secrets, and compliance with the issue scope.
3. Resolve defects found by validation or review, then rerun the relevant checks.
4. Report the validation commands, their outcomes, and any checks that could not be run with a reason.

## Phase 5: Commit and open the PR

Only after validation succeeds and review finds no unresolved blocking issues:

1. Commit only the issue-related changes, using the repository title convention: `[Area] short description`.
2. Create a pull request that targets the appropriate base branch and follows this exact description format from [CONTRIBUTING.md](../../CONTRIBUTING.md):

```markdown
## Summary 摘要

One or two sentences on what this PR does and why.
一到兩句話說明這個 PR 做了什麼、為什麼要做。

## Changes 變更內容

- Bullet list of what changed
- 條列式列出變更項目

## Testing Done 測試方式

Commands run and scenarios tested, including outcomes.
執行過的指令、測試過的情境及結果。

## Related Issue 相關 Issue

Closes #<issue-number>
Closes #<issue-number>（如適用）
```

3. Use the same `[Area] short description` convention for the PR title.
4. In the final response, provide the branch name, commit hash and subject, pull request URL, files changed, validation summary, and any remaining risks or follow-up work.

Never commit `.env` or `.env.production` values. Do not merge the pull request, close the issue manually, force-push, or alter unrelated working-tree changes unless the user explicitly asks.
