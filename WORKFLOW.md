# Minecraft Web Edition — Workflow

## 当前阶段
P2 — 体素数据模型与单区块渲染

## 阶段状态机
| 阶段 | 名称 | 状态 | 验收标准是否满足 | 核心指标记录 (DrawCalls/FPS等) | 备注 |
|---|---|---|---|---|---|
| P0 | 项目脚手架与调试面板 | done | yes | DrawCalls=2 (cube+grid), Triangles≈12+grid lines | Vite 8 + TS 7 + three 0.187 |
| P1 | 渲染循环与第一人称相机 | done | yes | DrawCalls=2, 60/144Hz 位移一致 (speed×dt) | YXZ 欧拉, pitch ±(90°−0.57°) |
| P2 | 体素数据模型与单区块渲染 | in-progress | no | - | |
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
定义 `CHUNK_SIZE=16 / CHUNK_HEIGHT=64` 常量与 `Chunk`（`Uint8Array`，`index = x + z*16 + y*256`，越界返回 AIR），实现 6 面 `FaceData` 与 `ChunkMesher`（仅邻居为 AIR 时生成面，CCW 索引 `[0,1,2,2,1,3]`），用正弦高度函数填充单区块并以 1 个 Mesh 渲染。

## 阻塞项与风险
无

## 下一步计划（当前任务完成后）
P2 验收（16×16 地形块、背面剔除无漏洞、F3 Draw Calls === 1）后进入 P3：PRNG + fBm 噪声、`floorMod` 坐标转换、`World` 多区块管理。

## 架构快照（当前目录树）
```text
src/
├── main.ts                 # 入口：天空色 + Fog，组装 Renderer / Loop / Input / FPS 相机 / UI
├── core/
│   ├── Renderer.ts         # WebGLRenderer + PerspectiveCamera + Scene 封装，resize 处理，info.autoReset=false
│   ├── Loop.ts             # rAF 主循环，dt = min(clock.getDelta(), MAX_DELTA=0.1)
│   ├── InputManager.ts     # 按键 Set、mousemove 累积 delta、滚轮、PointerLock 请求/状态、blur 清键
│   └── FirstPersonCamera.ts# YXZ 欧拉、pitch 钳制、yaw 驱动的水平移动、Space/Shift 升降、Ctrl 冲刺
└── ui/
    ├── DebugOverlay.ts     # F3 调试面板：FPS / Frame ms / Draw Calls / Triangles / Geometries / Pos / Chunk / Yaw / Pitch
    ├── PauseOverlay.ts     # 指针未锁定时的"点击开始"提示层（ESC 后自动回显）
    └── styles.css          # 全屏布局、调试面板、暂停层样式
```

## 关键决策与性能日志
- [2026-11-22 / P0] 工具链：pnpm 12 + Vite 8（rolldown）+ TypeScript 7.0 + three 0.187 / @types/three。`pnpm build` 定义为 `tsc --noEmit && vite build`，保证每次构建同时做类型检查。
- [2026-11-22 / P0] `tsconfig` 开启 `strict`、`noImplicitAny`、`noUnusedLocals`、`noUnusedParameters`、`noImplicitOverride`、`exactOptionalPropertyTypes`；禁止 `any`。
- [2026-11-22 / P0] `renderer.info.autoReset = false`，在 `Renderer.render()` 内手动 `info.reset()` 后再 render，使 DebugOverlay 在渲染后读取到的 `calls/triangles` 为本帧准确值。
- [2026-11-22 / P0] Delta Clamping（`MAX_DELTA = 0.1`）提前在 `Loop` 中落地，后续所有物理积分统一消费该 dt。
- [2026-11-22 / P0] 依赖清单：仅 `three`（运行时）；`vite`、`typescript`、`@types/three`（开发）。未引入任何其他第三方库。
- [2026-11-22 / P0] 性能基线：Draw Calls = 2（测试立方体 + GridHelper），dist JS 534 kB（gzip 133 kB，主要为 three 本体）。
- [2026-11-22 / P1] 相机采用 `rotation.set(pitch, yaw, 0, 'YXZ')`，pitch 钳制在 ±(π/2−0.01)；水平基向量仅由 yaw 推导（`forward=(−sin,0,−cos)`, `right=(cos,0,−sin)`），避免抬头时走路变慢。
- [2026-11-22 / P1] 输入层设计为"每帧 consume"模式（`consumeMouseDelta/consumeWheel`），事件只做累积，不在事件回调中改游戏状态，保证与主循环 dt 同步；`blur` 与解锁时清空按键集合防止粘键。
- [2026-11-22 / P1] 雾使用线性 `THREE.Fog(0x87CEEB, 60, 160)` 与背景同色，后续 P10 视距加载时可按 RENDER_DISTANCE 调整 near/far。
