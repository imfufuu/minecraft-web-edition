# Agent 工作流规范（ Minecraft Web Edition · Arena Agent Mode）

> 本文件规定 Agent 在本仓库工作时的流程、规则与工具约定；与 `ROADMAP.md`（P0–P11 计划）配套使用。

## 一、环境基线

- **仓库**：`/home/user/minecraft-web-edition`（Git，源 `github.com/imfufuu/minecraft-web-edition.git`）。
- **当前分支 = 会话分支**（见对话首条 Arena 消息）：永远在它上面工作，不切分支、不创建分支、不推送到其他分支；推送目标固定 `git push origin <当前分支>`。
- **Node**：22 + npm 10（沙箱内 `node_modules` 为空、pnpm 未安装 — 执行前检查 `ls node_modules` / `pnpm --version`；缺依赖环境时提前告知用户）。
- **命令**：`pnpm dev` / `pnpm typecheck` / `pnpm smoke` / `pnpm build` / `pnpm preview`。

## 二、标准工作流（每次任务按此执行）

1. **检查状态**：`git branch --show-current`、`git status --short`、`git log --oneline -3`（确认在当前分支、工作区干净）。
2. **阅读相关源文件**：用 `read_file`/`grep`/`fetch_page` 获取上下文（不盲改）。
3. **实现改动**：
   - 小改动用 `edit_file`（需先读文件再改）；
   - 新文件用 `write_file`；
   - 先 `git diff` 复核，再提交。
4. **验证**（有依赖环境时）：`pnpm typecheck`（零错误）→ `pnpm smoke`（三路 `lock-ok/lock-error/lock-silent` 通过）→ 必要时 `pnpm build`。
5. **提交**：`git add -A && git commit -m "..."`（消息：类型: 说明，中文可用；附带体为改动点列表）。
6. **推送**：`git push origin <当前分支>`。
7. **总结**（见第六节）。

## 三、硬性规则

1. **永远在当前分支上完成全部工作**（包括 commit 与 push）；只有用户明确说“不要改”/“只看”时才停止。
2. **不询问 GitHub 凭证**；git/`gh` 认证失败时如实告知并建议用户在 Arena 重连。
3. **不扩大范围**：只改任务相关文件；发现的其他问题（如评审清单里列出的非必须项）写入评审/路线图，不自动改。
4. **用户只要求“制定/计划/清单”时只输出、不写文件**（例如上一条评审的清单）。
5. **不注入叙事性空话**；所有“已做/验证”陈述必须能被 `git diff`/运行结果证明（要有工具调用过程）。
6. **提交前复核**：`git diff --stat` + 读已改文件关键区段；确认 `pnpm typecheck`/`pnpm smoke` 结果（有环境时）后再提交。

## 四、工具使用约定

| 场景 | 工具 |
|---|---|
| 读源码/文档 | `read_file`（带 offset/limit）、`grep`（bash） |
| 改现有文件 | `edit_file`（`old_text` 需唯一匹配、先读） |
| 新增文件 | `write_file` |
| 验证运行 | `bash`（`pnpm typecheck` 等） |
| 长进程（dev/preview） | `start_process`，用户可见预览（bind 0.0.0.0） |
| 搜索与访问 web | `web_search`/`fetch_page`（白名单主机：github.com 等） |
| 文档类任务 | 见 `ROADMAP.md`/`WORKFLOW.md`；需要视觉资产等请评估 |

## 五、验收门槛（完成定义）

- `pnpm typecheck`：0 错误（tsc strict + `noUnusedLocals`）。
- `pnpm smoke`：`lock-ok`、`lock-error`、`lock-silent` 三条冒烟通过。
- `pnpm build`：成功（产物 `dist/`，`.gitignore` 已忽略）。
- 提交：`git log` 上有新 commit，消息清晰；`git ls-remote origin <分支>` 与本地 HEAD 一致。

## 六、变更后必做总结（每次收尾给用户）

列出改动点（文件路径 + 一行价值/原因）+ 验证结果 + commit/push 状态。

---

## 七、典型任务范例（参考）

> 用户：“修复 ErrorBar 的空文件名问题”
>
> Agent：
> 1. `read_file src/ui/ErrorBar.ts`（定位）。
> 2. `edit_file` 改 `e.filename.split('/')` → `e.filename?.split('/').pop() ?? ''`。
> 3. `git diff` 复核 → `pnpm typecheck` → `pnpm smoke`（有环境）。
> 4. `git add -A && git commit -m "Harden ErrorBar filename handling"`。
> 5. `git push origin <当前分支>`。
> 6. 总结：`src/ui/ErrorBar.ts | 2 +- | 防止没有 filename 的错误事件让错误处理器自己抛错`。
