# DEVELOPMENT - 开发导航（Index）

本文档是本仓库的“开发入口/索引”。为避免一次性信息过载，详细规范已拆分到各模块目录下，请按需打开对应文档。

## 如何使用（给 Agent / 开发者）

1.  **每次任务先读本文件**：获取全局硬规则、文档地图与常用入口。
2.  **需要更深细节时**：参考 `AGENTS.md` 或 `docs/` 内的专题文档。

## 开发与测试指南

### 核心编码原则 (Core Coding Principles)

1.  **优先复用 (Prioritize Reuse)**: 在创建任何新代码、组件或工具函数之前，**必须**彻底搜索现有代码库以查找可复用组件。如无必要勿增实体，避免重复造轮子。
2.  **单一职责原则 (Single Responsibility Principle)**: 每个类、函数或模块都应只负责一项功能，保持高内聚。
3.  **保持简单 (KISS)**: 优先选择简单直接的解决方案，避免过度工程化。
4.  **不要重复自己 (DRY)**: 避免代码重复，通过抽象和复用提高代码质量。
5.  **小步迭代与持续验收 (Incremental Iteration & Continuous Acceptance)**: 主要功能必须拆分为独立可测试、可验收的步骤，确保小步快跑，频繁集成，并持续验证业务价值。
6.  **封装横切关注点 (Encapsulate Cross-Cutting Concerns)**: 如发现对于影响多个模块的通用功能（如IPC通信、日志、错误处理），应重构统一封装，避免在使用方重复实现。
7.  **组件逻辑内化 (Logic Internalization)**: 重构时，将分散在使用方的重复逻辑下沉到组件内部，实现组件自治，让组件自己管理自己的行为。
8.  **关注点分离 (Separation of Concerns)**: 将不同的职责分配到不同的模块（Main/Preload/Renderer），每个模块专注于一件事，降低耦合度。

## 全局硬规则（摘要）

-   **架构分层**：本项目为 Clean 架构
    -   **Main Process**：负责系统级操作、窗口管理、文件系统访问。
    -   **Preload**：安全桥接，暴露有限的 API 给渲染进程。
    -   **Renderer**：纯 UI 逻辑 (React 19 + Tailwind v4)，**严禁**直接调用 Node.js API。
-   **Small vs Large**（详见 `AGENTS.md`）：
    -   **Small**：直接做，小步快反馈，跑针对性验证。
    -   **Large / 运行时高风险**：遵循 **Spec -> (Feasibility Check) -> Plan** 流程。
        -   **Spec**：明确验收标准、风险点及验证手段，等待确认。
        -   **Feasibility Check**：针对新技术/高性能/核心重构，必须先调研并跑通 PoC。
        -   **Plan**：制定详细执行计划，等待确认。
        -   **验证**：UI 变更需提供截图/录屏；重大功能需跑通 E2E。
        -   **兼容与迁移**：改动 IPC 接口或数据结构时，必须考虑对现有功能的影响。
-   **禁止手改**：
    -   lock 文件 (`pnpm-lock.yaml`) 必须由命令生成/更新。
    -   生成代码（如自动生成的类型定义等）禁止手改。
-   **提交前检查（与 CI 对齐的最低门槛）**：
    -   执行 `pnpm pre-commit` （type, lint, format, test）
-   **测试失败排查前置**：
    -   凡遇到 `pnpm pre-commit`、`pnpm test -- --run`、`pnpm test:e2e` 或单独 `Playwright` 用例失败，继续排查前**必须先阅读** `docs/DEBUGGING.md`。
-   **安全（Electron Security）**：
    -   始终开启 Context Isolation。
    -   Renderer 进程禁止开启 Node Integration。
    -   IPC 通信必须校验参数类型 (validate ALL inputs)。

## 快速开始

-   **安装依赖**：`pnpm install`
-   **启动开发环境**：`pnpm dev`
    - 默认使用独立的 `userData` 目录（避免污染已安装版本的数据）
    - 如需临时复用已安装包的数据：`COVE_DEV_USE_SHARED_USER_DATA=1 pnpm dev` 或 `pnpm dev -- --shared-user-data`
    - 如需自定义 dev 的数据目录：`COVE_DEV_USER_DATA_DIR=/path/to/userData pnpm dev`
-   **运行单元测试**：`pnpm test -- --run`
-   **运行 E2E 测试**：`pnpm test:e2e`
    -   说明：`pnpm test:e2e` 已包含构建步骤，默认使用 `offscreen` 后台窗口模式；检测到 Electron 崩溃特征时，会按窗口模式链路自动降级并重跑失败用例（例如 `hidden -> offscreen`、`offscreen -> inactive`）。
    -   可通过 `COVE_E2E_WINDOW_MODE` 指定窗口模式（`normal / inactive / offscreen / hidden`）。
    -   如需关闭自动降级，可设置 `COVE_E2E_DISABLE_CRASH_FALLBACK=1`。
    -   若需单独执行 Playwright（如 `pnpm exec playwright test tests/e2e/xxx.spec.ts`），必须先执行 `pnpm build`，否则可能仍会使用旧的 `out/` 产物，导致结果与当前源码不一致。

## 文档地图（按问题找入口）

-   **Agent 行为准则与详细工作流**：`AGENTS.md` (The Single Source of Truth for Agents)
-   **架构标准（Clean + Feature-First）**：`docs/ARCHITECTURE.md`
-   **持久化（SQLite schema / migrations）**：`docs/PERSISTENCE.md`
-   **UI 开发标准**：
    -   窗口 UI 标准：`docs/WINDOW_UI_STANDARD.md`
    -   任务 UI 标准：`docs/TASK_UI_STANDARD.md`
    -   视口导航标准：`docs/VIEWPORT_NAVIGATION_STANDARD.md`
-   **终端渲染基准**：`docs/TERMINAL_TUI_RENDERING_BASELINE.md`
-   **调试指南**：`docs/DEBUGGING.md`
-   **贡献代码指南**：`CONTRIBUTING.md`
-   **API Client 生成与使用**：暂无，参考 `src/shared/ipc` 定义。

## 检索建议（避免一次性读完）

-   优先在 `AGENTS.md` 中查找开发及其流程规范。
-   涉及具体 UI/功能模块时，检索 `docs/` 下的相关文档。
-   搜索现有代码中的实现模式，遵循 "Prioritize Reuse" 原则。
