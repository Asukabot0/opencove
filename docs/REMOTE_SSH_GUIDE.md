# Remote SSH Feature Guide

## Overview

Remote SSH 功能允许用户在 OpenCove 中管理远程 SSH 目标，并通过 SSH 连接到远程服务器执行终端操作。该功能基于 `ssh2`（纯 JS，无需 native rebuild）和 `ssh-config`（纯 JS）实现。

> **当前状态**: Phase 1 已完成基础设施层，包括 SSH 目标管理（CRUD）、SSH Config 导入、SshAdapter、凭证对话框和 Host Key 验证对话框。SSH 连接的端到端串联（IPC handler 注册 + UI 入口挂载）将在后续 Phase 中完成。

## Architecture

```
contexts/remote/
  domain/           RemoteTarget entity, Repository port, typed enums
  application/      ConnectSsh, DisconnectSsh, ImportSshConfig, ManageRemoteTargets
  infrastructure/   DrizzleRemoteTargetRepository, SshConfigParser, HostKeyVerifier
  presentation/
    main-ipc/       IPC handlers (register, credentialIpc, validate)
    renderer/       RemoteTargetManager, SshCredentialDialog, HostKeyConfirmDialog

platform/process/ssh/
  SshAdapter.ts     TerminalSessionAdapter implementation via ssh2

terminal/
  domain/           TerminalSessionAdapter interface, SessionKind ('local' | 'ssh')
  application/      TerminalSessionManager (multi-adapter registry)
```

## What's Available Now

### 1. Remote Target Management (CRUD)

通过 IPC 通道管理 SSH 目标：

| IPC Channel | Description |
|---|---|
| `remote:list-targets` | 列出某个 workspace 下所有远程目标 |
| `remote:get-target` | 获取单个目标详情 |
| `remote:create-target` | 手动添加新目标 |
| `remote:update-target` | 更新目标配置 |
| `remote:delete-target` | 删除目标 |
| `remote:import-ssh-config` | 从 `~/.ssh/config` 导入目标 |

**Renderer API** (通过 preload bridge 暴露):

```typescript
window.opencoveApi.remote.listTargets(workspaceId)
window.opencoveApi.remote.getTarget(id)
window.opencoveApi.remote.createTarget(payload)
window.opencoveApi.remote.updateTarget(payload)
window.opencoveApi.remote.deleteTarget(payload)
window.opencoveApi.remote.importSshConfig(payload)
```

### 2. Remote Target Data Model

存储在 SQLite `remote_targets` 表中，字段包括：

| Field | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `workspaceId` | TEXT | 所属 workspace |
| `name` | TEXT | 显示名称 |
| `host` | TEXT | 主机名或 IP |
| `port` | INTEGER | SSH 端口，默认 22 |
| `username` | TEXT | 用户名 |
| `authMethod` | TEXT | 认证方式: `key`, `password`, `agent`, `keyboard-interactive` |
| `keyPath` | TEXT? | SSH 私钥路径 |
| `forwardAgent` | INTEGER | 是否转发 agent (0/1) |
| `source` | TEXT | 来源: `manual`, `ssh_config`, `imported` |
| `importedFrom` | TEXT? | 导入来源文件路径 |
| `secretRef` | TEXT? | 预留，用于 secret 存储引用 |
| `connectTimeout` | INTEGER | 连接超时 (ms)，默认 10000 |

### 3. SSH Config Import

`ImportSshConfig` 服务可解析 `~/.ssh/config`，支持三种冲突策略：

- **skip**: 跳过已存在的同名目标
- **overwrite**: 覆盖已存在的同名目标
- **duplicate**: 创建副本

支持解析的 SSH Config 指令：`Host`, `HostName`, `Port`, `User`, `IdentityFile`, `ForwardAgent`, `ConnectTimeout`

### 4. SshAdapter (Terminal Session Adapter)

`SshAdapter` 实现了 `TerminalSessionAdapter` 接口，功能包括：

- 通过 ssh2 `Client` 建立 SSH 连接
- `CredentialResolver` 回调：60s 超时 + 用户取消支持
- `HostKeyVerifier` 回调：host key 确认
- SSH keepalive: 15s 间隔，最多 3 次失败
- 独立 `SnapshotState` 缓冲区（400K 字符上限）
- SSH 断连时 `exitCode: null`（区别于本地 PTY 的数字退出码）
- `supportsAgentWatcher = false`（SSH session 不支持 agent 状态监控）
- `DisconnectReason` 分类：`closed`, `timeout`, `auth_failure`, `host_unreachable`, `host_key_mismatch`, `network_error`, `unknown`

### 5. UI Components (已实现，待挂载)

**RemoteTargetManager**: 远程目标管理面板
- 显示已保存目标列表（格式：`name | username@host:port`）
- "Import from SSH Config" 按钮
- "Add Remote Target" 按钮 + 表单（name, host, port, username）
- 每个目标有删除按钮

**SshCredentialDialog**: 凭证输入对话框
- 支持密码认证、SSH key passphrase、keyboard-interactive
- 监听 `sshCredentialRequest` IPC 事件
- 通过 `sshCredentialResponse` 返回用户输入

**HostKeyConfirmDialog**: Host Key 验证对话框
- Unknown key: 显示指纹，提示用户接受并连接
- Mismatched key: 警告潜在 MITM 攻击，阻止连接

### 6. i18n Support

en 和 zh-CN 双语支持。所有 remote 相关的 UI 文本在 `src/app/renderer/i18n/locales/` 中定义，key 前缀为 `remote.*`。

## What's NOT Yet Wired (Phase 2 TODO)

以下部分已编码实现但尚未串联到可用的端到端流程：

1. **SSH Connect IPC Handler 未注册** — `ssh:connect` channel 存在但 main process 中无对应 handler
2. **SshAdapter 未注入 pty runtime** — 需要在 `createPtyRuntime` 的 `adapterRegistry` 中注册 SSH adapter
3. **UI 入口未挂载** — `RemoteTargetManager` 组件未集成到 SettingsPanel 或侧边栏
4. **HostKeyConfirmDialog 未串联** — 握手期间无法将对话框推送到 renderer
5. **Terminal SSH 状态同步** — `pty:ssh-connection-state` channel 未使用

## Phase 2 Integration Checklist

完成以下步骤即可让功能端到端可用：

- [ ] 在 `registerIpcHandlers` 中注册 `ssh:connect` handler，调用 `ConnectSsh` 服务
- [ ] 在 `createPtyRuntime` 中将 `SshAdapter` 加入 `adapterRegistry`（key: `'ssh'`）
- [ ] 将 `RemoteTargetManager` 挂载到 Settings 或 Sidebar 中
- [ ] 将 `SshCredentialDialog` 和 `HostKeyConfirmDialog` 挂载到 App 根组件
- [ ] 在 `RemoteTargetManager` 中为每个目标添加 "Connect" 按钮，调用 `window.opencoveApi.ssh.connect()`
- [ ] 连接成功后打开 SSH terminal session（SessionKind = 'ssh'）

## Key Files Reference

| File | Purpose |
|---|---|
| `src/contexts/remote/domain/RemoteTarget.ts` | Entity 定义 |
| `src/contexts/remote/domain/RemoteTargetRepository.ts` | Repository port |
| `src/contexts/remote/domain/types.ts` | AuthMethod, DisconnectReason enums |
| `src/contexts/remote/application/ConnectSsh.ts` | SSH 连接编排 |
| `src/contexts/remote/application/ManageRemoteTargets.ts` | CRUD 服务 |
| `src/contexts/remote/application/ImportSshConfig.ts` | SSH Config 导入 |
| `src/contexts/remote/infrastructure/DrizzleRemoteTargetRepository.ts` | SQLite 持久化 |
| `src/contexts/remote/infrastructure/SshConfigParser.ts` | SSH Config 解析 |
| `src/contexts/remote/infrastructure/HostKeyVerifier.ts` | Host Key 验证 |
| `src/contexts/remote/presentation/main-ipc/register.ts` | IPC handler 注册 |
| `src/contexts/remote/presentation/main-ipc/credentialIpc.ts` | 凭证 IPC 流 |
| `src/contexts/remote/presentation/renderer/components/RemoteTargetManager.tsx` | 目标管理 UI |
| `src/contexts/remote/presentation/renderer/components/SshCredentialDialog.tsx` | 凭证对话框 |
| `src/contexts/remote/presentation/renderer/components/HostKeyConfirmDialog.tsx` | Host Key 对话框 |
| `src/platform/process/ssh/SshAdapter.ts` | SSH 终端适配器 |
| `src/platform/credentials/KeychainService.ts` | Electron safeStorage 封装 |
| `src/shared/contracts/dto/remote.ts` | Remote 相关 DTO |
| `src/shared/contracts/ipc/channels.ts` | IPC channel 定义 |
