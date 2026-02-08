# Debugging Guide

## E2E: Electron + Playwright 稳定运行

本项目 E2E 测试依赖 `out/` 目录产物（`out/main`、`out/preload`、`out/renderer`）。
如果直接改代码后不重建就跑 E2E，Playwright 可能会启动旧产物，出现“看起来像新问题，实际是旧构建”的假失败。

### 常见症状

- 点击 `Add` 后没有 workspace 出现。
- 页面突然空白（`#root` 为空）。
- 终端拖拽/缩放后出现渲染异常。
- 右键建终端在 E2E 中偶发失败（命中节点而非 pane）。

## 已落地的稳定性策略

### 1) E2E 一律先构建

已将 `test:e2e` 固化为：

```bash
pnpm build && playwright test
```

因此直接执行：

```bash
pnpm test:e2e
```

### 2) 目录选择使用测试注入路径

主进程 `workspace:select-directory` 支持读取 `COVE_TEST_WORKSPACE`。
E2E 启动 Electron 时必须注入该变量，避免系统原生弹窗阻塞。

### 3) 每个用例先清空持久化状态

清理 localStorage key：`cove:m0:workspace-state`，然后 `reload`，避免状态互相污染。

### 4) 交互回归采用“状态 seed”而非依赖右键建第二个终端

已在 `tests/e2e/workspace-canvas.spec.ts` 中采用：

- **交互稳定性测试**：先向 localStorage 注入带 1~2 个终端节点的状态，再 reload。
- **启动冒烟测试**：继续由 `tests/e2e/smoke.spec.ts` 覆盖窗口与应用启动可用性。

这样可稳定覆盖以下核心场景：

- 终端拖拽后不空白；
- 终端缩放后尺寸变化且不空白；
- 与另一个终端窗口交互后不空白；
- 终端区域滚轮不会缩放画布。

这套方式规避了“可见区右键位置被节点遮挡”带来的随机性。

## 推荐调试流程

### 1) 先跑目标用例

```bash
pnpm test:e2e -- tests/e2e/workspace-canvas.spec.ts
```

### 2) 失败时看 trace

```bash
pnpm exec playwright show-trace test-results/<failed-case>/trace.zip
```

重点检查：

- `console` / `pageerror`；
- `workspace-item` 是否出现；
- `.terminal-node` 数量是否与预期一致；
- `.xterm` 在拖拽/缩放后是否仍可见；
- `.react-flow__viewport` 样式在终端滚轮后是否变化。

### 3) 全量回归

```bash
pnpm test:e2e
```

## 渲染空白专项排查清单

出现“窗口交互后终端空白/整块重渲染”时，优先检查：

1. `WorkspaceCanvas` 的 `nodeTypes` 是否保持稳定引用（避免节点 remount）。
2. `TerminalNode` 是否仅在 `sessionId` 变化时重建 xterm 实例。
3. 拖拽/缩放是否只更新位置和尺寸，而不是替换节点身份。
4. 当前 E2E 是否跑的是最新 `out/` 构建产物。
