# Changelog

## 0.3.0 - 2026-05-26

### Added

- Added ORION, a high-permission workflow copilot that can draft workflows from conversation.
- Added ORION action registry with `direct`, `confirm`, and `strong-confirm` permission levels.
- Added ORION workflow planner for bug investigation flows with Trellis, bug-investigation, and test-planning capabilities.
- Added safe ORION local action primitives for project file reads, generated artifact writes, command whitelist validation, release build risk classification, and git action risk classification.
- Added `@orion` composer flow to preview an action plan, save a drafted workflow after confirmation, and run it through ORCH Core.

### Changed

- Expanded workflow self-tests and Rust tests to cover ORION action permissions, workflow planning, and local action safety boundaries.

## 0.2.0 - 2026-05-25

### Added

- Added workflow intelligence routing so ORCH can choose full development, bug-fix, or test-only workflows from the task text.
- Added a local long-term memory rule store at `%APPDATA%\ORX\memory_rules.json`.
- Added memory retrieval into workflow upstream context and Retrospective-based rule capture.
- Added PD Trellis clarification as a multi-turn workflow capability before PRD generation.
- Added Trellis clarification pause/resume handling in the composer while preserving the existing PRD and CR approval gates.
- Added implementation plans and documentation for workflow intelligence and Trellis clarification.

### Changed

- Updated default full-development workflow to include `PD Agent / Clarification` before `ScenarioRehearsal`.
- Extended workflow step metadata with skill, interaction, and exit-condition fields.
- Expanded frontend and Rust workflow self-tests to cover routing, memory rules, and Trellis clarification.

### Verified

- `npm --cache D:\npm-cache run workflow:selftest`
- `npm --cache D:\npm-cache run build`
- `cargo test`

## 0.1.0 - 2026-05-24

### Added

- Initial ORX desktop client release with Tauri, Rust, React, local project scanning, provider configuration, workflow orchestration, artifact archiving, attachment handling, approval gates, and release installers.
