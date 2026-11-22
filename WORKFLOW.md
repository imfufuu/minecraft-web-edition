# Minecraft Web Edition — Workflow

## 当前阶段
P1 — 渲染循环与第一人称相机

## 阶段状态机
| 阶段 | 名称 | 状态 | 验收标准是否满足 | 核心指标记录 (DrawCalls/FPS等) | 备注 |
|---|---|---|---|---|---|
| P0 | 项目脚手架与调试面板 | done | yes | DrawCalls=2 (cube+grid), Triangles≈12+grid lines | Vite 8 + TS 7 + three 0.187 |
| P1 | 渲染循环与第一人称相机 | in-progress | no | - | |
| P2 | 体素数据模型与单区块渲染 | pending | no | - | |
| P3 | 区块化世界与种子地形 | pending | no | - | |
| P4 | 跨区块面剔除与网格合并 | pending | no | - | |
| P5 | 玩家物理与 AABB 碰撞 | pending | no | - | |
| P6 | 方块交互（挖掘/放置） | pending | no | - | |
| P7 | 快捷栏、注册表与程序化纹理 | pending | no | - | |
| P8 | 顶点光照与环境光遮蔽(AO) | pending | no | - | |
| P9 | IndexedDB 增量存档与恢复 | pending | no | - | |
| P10 | Web Worker 多线程与视距卸载 | pending | no | - | |
| P11 | 可选进阶特性 | pending | no | - | |

## 当前任务
实现 `src/core/InputManager.ts`（按键状态集合 + PointerLock + mousemove）与 `src/core/FirstPersonCamera.ts`（YXZ 欧拉角、pitch 钳制 ±89°、水平面 WASD 移动、Space/Shift 升降），并添加天空色 `0x87CEEB` 与雾。

## 阻塞项与风险
无

## 下一步计划（当前任务完成后）
P1 验收（锁定/ESC 提示层、60Hz 与 144Hz 速度一致、快速甩鼠标不翻转）后，进入 P2：`Chunk` Uint8Array 模型与单区块暴露面剔除 Mesher。

## 架构快照（当前目录树）
```text
src/
├── main.ts                 # 入口：组装 Renderer / Loop / DebugOverlay，P0 测试立方体 + GridHelper
├── core/
│   ├── Renderer.ts         # WebGLRenderer + PerspectiveCamera + Scene 封装，resize 处理，info.autoReset=false
│   └── Loop.ts             # rAF 主循环，dt = min(clock.getDelta(), MAX_DELTA=0.1)
└── ui/
    ├── DebugOverlay.ts     # F3 调试面板：FPS / Frame ms / Draw Calls / Triangles / Geometries / Pos / Chunk
    └── styles.css          # 全屏无滚动条布局、调试面板样式
```

## 关键决策与性能日志
- [2026-11-22 / P0] 工具链：pnpm 12 + Vite 8（rolldown）+ TypeScript 7.0 + three 0.187 / @types/three。`pnpm build` 定义为 `tsc --noEmit && vite build`，保证每次构建同时做类型检查。
- [2026-11-22 / P0] `tsconfig` 开启 `strict`、`noImplicitAny`、`noUnusedLocals`、`noUnusedParameters`、`noImplicitOverride`、`exactOptionalPropertyTypes`；禁止 `any`。
- [2026-11-22 / P0] `renderer.info.autoReset = false`，在 `Renderer.render()` 内手动 `info.reset()` 后再 render，使 DebugOverlay 在渲染后读取到的 `calls/triangles` 为本帧准确值。
- [2026-11-22 / P0] Delta Clamping（`MAX_DELTA = 0.1`）提前在 `Loop` 中落地，后续所有物理积分统一消费该 dt。
- [2026-11-22 / P0] 依赖清单：仅 `three`（运行时）；`vite`、`typescript`、`@types/three`（开发）。未引入任何其他第三方库。
- [2026-11-22 / P0] 性能基线：Draw Calls = 2（测试立方体 + GridHelper），dist JS 534 kB（gzip 133 kB，主要为 three 本体）。
