#Changelog

## 03/30/26

### Fixed
- **Chain output routing** — Chain completions now correctly display the designated output stage result (e.g., the synthesis intelligence brief) instead of the last stage's output (e.g., memory update summary)

### Added
- **`is_output_stage` flag** — Chain stage definitions can now explicitly declare which stage produces the user-facing deliverable
- **`is_background` flag** — Chain stages can be marked as background (side-effect only), ensuring their output is never shown to the user as the final result
- **OSINT Chain `memory_update` stage** — New background stage that persists intelligence to memory files after synthesis completes
- **Improved output fallback logic** — If the designated output stage produces no content, falls back to the last non-background stage instead of defaulting to "Chain completed"
- **Synthesis stdout enforcement** — Updated synthesis prompt to require the intelligence brief in the response text, not just written to files
- **Background stage UI treatment** — Background stages render at 50% opacity in ChainProgress; output stages get an accent ring highlight
- **Copy-to-clipboard for task results** — Task result section now includes a copy button for easy extraction of long outputs
- **Chain engine debug logging** — Logs stage output length and final result selection for easier troubleshooting

## 02/15/26

### Created first version of agentic chain

- **Two modes of operation** - Research and development, each launching different mode of operation
- **Early beta, needs feedback and more support** - Further testing needed

## 02/07/26

### Fixed
- **start.sh** — Fixed virtual environment path to reference project root `env/` instead of non-existent `orchestrator/env/`
- **start.sh** — Replaced `uv run uvicorn` with `python -m uvicorn` since `uv` is not installed, using the project's own venv Python

---

## 02/06/26

### Added
- **Dedicated GitHub Tab** — New top-level tab with PR list, issues, branches, commits, and git status bar all in one place
- **PR Detail Modal** — Click any PR to see a full detail view with three tabs: Overview (description, merge status), Files (expandable unified diffs with syntax coloring), and Comments (timeline of reviews and comments)
- **PR Review Actions** — Approve, request changes, merge (with method picker: merge/squash/rebase), and close PRs directly from the app
- **Assign PR to Agent** — Send a PR to an AI agent with three presets: Review & Comment, Fix Issues, or a custom prompt. Agent receives full PR context automatically
- **Task ↔ Issue Sync** — Completing a task auto-closes its linked GitHub issue. Polling-based sync detects externally closed issues and marks linked tasks as done. Gated by project `sync_issues` setting
- **PR Notifications** — Badge on the GitHub tab shows count of new PRs since last visit. Polls every 60 seconds, tracks seen PRs in localStorage

### Changed
- PR list items now open the detail modal instead of linking to GitHub
- Navigation updated from 4 tabs to 5 (Tasks, Chat, GitHub, Files, Settings)
- Docs updated: userguide.md GitHub section rewritten, README features table expanded, docs/README.md updated with new component descriptions and guide links

### Fixed
- Python `not_` syntax error in sync endpoint replaced with `.neq()` filter chain
- Unused TypeScript variable build errors in AssignToAgentDialog and PRActions

---

## 02/04/26

### Added
- Github Support/ Push Pull requests, branching
- Quality of life updates, copy buttons throughout
- Solved some chat persistency issues
