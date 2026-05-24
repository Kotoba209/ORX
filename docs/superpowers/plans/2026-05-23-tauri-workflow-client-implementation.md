# Tauri Workflow Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight Tauri/Rust desktop client that can add local projects, read code context, configure service agents, and drive a test-oriented workflow loop.

**Architecture:** React/Vite renders the CLI-style interface. Rust/Tauri commands own local filesystem access, project scanning, configuration storage, workflow state, and later command execution. Keep core Rust logic testable outside the Tauri shell.

**Tech Stack:** Tauri 2, Rust 1.95, React, Vite, TypeScript, SQLite later, Vitest, Cargo tests.

---

### Task 1: Scaffold Client Project

**Files:**
- Create: `package.json`
- Create: `src/`
- Create: `src-tauri/`

- [ ] **Step 1: Create Tauri React TypeScript skeleton**

Use `npm create tauri-app` or equivalent minimal Tauri structure under `D:\CodexProjects\ORX`.

- [ ] **Step 2: Verify baseline commands**

Run `npm --cache D:\npm-cache install`, `npm --cache D:\npm-cache run build`, and `cargo test` inside `src-tauri`.

### Task 2: Project Scanner Core

**Files:**
- Create: `src-tauri/src/project_scanner.rs`
- Test: `src-tauri/src/project_scanner.rs`

- [ ] **Step 1: Write failing Rust tests**

Test that scanner skips `.git`, `node_modules`, `dist`, `build`, `target`, `.next`, `coverage`, and returns relative file paths for normal source files.

- [ ] **Step 2: Implement scanner**

Implement recursive scanning with max depth and max file size guards.

- [ ] **Step 3: Expose Tauri command**

Expose `scan_project(path: String)` returning project summary DTO.

### Task 3: Context Summary Core

**Files:**
- Create: `src-tauri/src/context_summary.rs`
- Test: `src-tauri/src/context_summary.rs`

- [ ] **Step 1: Write failing tests**

Test that README, package/Cargo manifests, source file counts, and test file counts are surfaced.

- [ ] **Step 2: Implement summary**

Produce a compact context summary suitable for prompt injection.

### Task 4: Provider And Agent Config

**Files:**
- Create: `src-tauri/src/provider_config.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write tests for provider validation**

Validate provider id, kind, base URL, model, and key reference.

- [ ] **Step 2: Implement in-memory config first**

Use in-memory storage for MVP; SQLite/keychain comes after UI is usable.

### Task 5: Workflow State Model

**Files:**
- Create: `src-tauri/src/workflow.rs`

- [ ] **Step 1: Write state transition tests**

Verify demand intake -> scenario rehearsal -> boundary probing -> red-blue challenge -> task split -> test plan -> retrospective.

- [ ] **Step 2: Implement pure Rust state transitions**

Keep it framework-independent so it can be tested with `cargo test`.

### Task 6: CLI-Style Frontend

**Files:**
- Create/Modify: `src/App.tsx`
- Create/Modify: `src/styles.css`

- [ ] **Step 1: Build layout**

Left project rail, center terminal log/chat input, right context/test/rules panel.

- [ ] **Step 2: Connect scan command**

Call Tauri `scan_project` and render returned context summary.

### Task 7: Verification

**Files:**
- Modify: tests as needed

- [ ] **Step 1: Run Rust tests**

Run: `cargo test` in `src-tauri`.

- [ ] **Step 2: Run frontend build**

Run: `npm --cache D:\npm-cache run build`.

- [ ] **Step 3: Run Tauri dev/build when prerequisites are ready**

Run: `npm --cache D:\npm-cache run tauri dev` or `npm --cache D:\npm-cache run tauri build`.
