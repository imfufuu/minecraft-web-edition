# Minecraft Web Edition — Workflow

## 当前阶段
P3 — 区块化世界与种子地形

## 阶段状态机
| 阶段 | 名称 | 状态 | 验收标准是否满足 | 核心指标记录 (DrawCalls/FPS等) | 备注 |
|---|---|---|---|---|---|
| P0 | 项目脚手架与调试面板 | done | yes | DrawCalls=2 (cube+grid), Triangles≈12+grid lines | Vite 8 + TS 7 + three 0.187 |
| P1 | 渲染循环与第一人称相机 | done | yes | DrawCalls=2, 60/144Hz 位移一致 (speed×dt) | YXZ 欧拉, pitch ±(90°−0.57°) |
| P2 | 体素数据模型与单区块渲染 | done | yes | DrawCalls=1；满区块 4608 面（理论值一致）；12 个三角形 CCW 校验通过 | Uint8Array + 暴露面剔除 |
| P3 | 区块化世界与种子地形 | in-progress | no | - | |
| P4 | 跨区块面剔除与网格合并 | pending | no | - | |
| P5 | 玩家物理与 AABB 碰撞 | pending | no | - | |
| P6 | 方块交互（挖掘/放置） | pending | no | - | |
| P7 | 快捷栏、注册表与程序化纹理 | pending | no | - | |
| P8 | 顶点光照与环境光遮蔽(AO) | pending | no | - | |
| P9 | IndexedDB 增量存档与恢复 | pending | no | - | |
| P10 | Web Worker 多线程与视距卸载 | pending | no | - | |
| P11 | 可选进阶特性 | pending | no | - | |

## 当前任务
实现 `utils/prng.ts`（mulberry32）、`utils/noise.ts`（确定性 2D Simplex/Perlin + 3 层 fBm）、`utils/math.ts`（`floorMod` / `worldToChunkCoords`），`world/TerrainGenerator.ts` 与 `world/World.ts`（`Map<string, Chunk>`），填充 [-2,2]×[-2,2] 共 25 个区块并各自生成 1 个 Mesh。

## 阻塞项与风险
无

## 下一步计划（当前任务完成后）
P3 验收（25 区块无缝、负坐标无错位、同 Seed 100% 一致）后进入 P4：Mesher 通过 `world.getBlock` 查询跨区块邻居、包围盒/视锥剔除、记录顶点压缩率。

## 架构快照（当前目录树）
```text
src/
├── main.ts                 # 入口：天空/雾/灯光，单区块 data -> ChunkMesher -> 1 Mesh，组装 Loop / Input / UI
├── blocks/
│   └── BlockTypes.ts       # BlockId (as const) + 临时纯色表 BLOCK_COLORS + isSolid
├── world/
│   └── Chunk.ts            # CHUNK_SIZE=16 / CHUNK_HEIGHT=64，Uint8Array(16384)，chunkIndex，越界读返回 AIR，dirty 标记
├── mesh/
│   ├── FaceData.ts         # 6 面：dir / normal / 4 corners，FACE_INDICES=[0,1,2,2,1,3]（CCW 朝外）
│   └── ChunkMesher.ts      # 暴露面剔除 -> positions/normals/colors/indices -> BufferGeometry
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
- [2026-11-22 / P2] `BlockId` 采用 `as const` 对象 + 派生联合类型而非 `enum`，保持 `isolatedModules` 友好且运行时就是纯数字。
- [2026-11-22 / P2] 面数据约定：每个面 4 角按"左下、右下、左上、右上（从外部看）"排列，统一索引 `[0,1,2,2,1,3]`；已用脚本验证 6 面 × 2 三角形的 `(v1−v0)×(v2−v0)·normal` 全为 +1。P8 的 AO 翻转只需切换为 `[1,2,3,1,3,0]`。
- [2026-11-22 / P2] Mesher 使用复用的 JS 数组作为 scratch buffer，最后一次性拷贝为 TypedArray；索引使用 `Uint32Array`（满区块 4608 面 = 18432 顶点，已超过 Uint16 上限 65535 的一半，为 P11 贪婪网格前的安全余量）。
- [2026-11-22 / P2] 性能基线：单区块正弦地形 Draw Calls = 1；满区块理论上限 4608 面 / 9216 三角形。
