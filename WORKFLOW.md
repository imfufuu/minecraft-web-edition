# Minecraft Web Edition — Workflow

## 当前阶段
P6 — 方块交互（挖掘/放置）

## 阶段状态机
| 阶段 | 名称 | 状态 | 验收标准是否满足 | 核心指标记录 (DrawCalls/FPS等) | 备注 |
|---|---|---|---|---|---|
| P0 | 项目脚手架与调试面板 | done | yes | DrawCalls=2 (cube+grid), Triangles≈12+grid lines | Vite 8 + TS 7 + three 0.187 |
| P1 | 渲染循环与第一人称相机 | done | yes | DrawCalls=2, 60/144Hz 位移一致 (speed×dt) | YXZ 欧拉, pitch ±(90°−0.57°) |
| P2 | 体素数据模型与单区块渲染 | done | yes | DrawCalls=1；满区块 4608 面（理论值一致）；12 个三角形 CCW 校验通过 | Uint8Array + 暴露面剔除 |
| P3 | 区块化世界与种子地形 | done | yes | 25 区块 / DrawCalls=25；同 Seed 字节级一致；负坐标往返校验通过 | 手写 Simplex2D + 3 层 fBm |
| P4 | 跨区块面剔除与网格合并 | done | yes | 25 区块面数 53,716→24,790（−53.8%），顶点 −53.8%；DrawCalls ≤ 视野内区块数，背对时 0 | 移除面数 == 理论接缝数 |
| P5 | 玩家物理与 AABB 碰撞 | done | yes | 静止 120 帧 y 唯一值=1；贴墙滑行 x 钉 4.6999；跳跃 1.22 格；dt=0.1 不穿地 | Y→X→Z 分轴扫掠，子步 ≤0.5 |
| P6 | 方块交互（挖掘/放置） | in-progress | no | - | |
| P7 | 快捷栏、注册表与程序化纹理 | pending | no | - | |
| P8 | 顶点光照与环境光遮蔽(AO) | pending | no | - | |
| P9 | IndexedDB 增量存档与恢复 | pending | no | - | |
| P10 | Web Worker 多线程与视距卸载 | pending | no | - | |
| P11 | 可选进阶特性 | pending | no | - | |

## 当前任务
实现 `player/BlockInteraction.ts`：每帧从相机中心 Raycaster(far=6) 检测区块 Mesh，按 7.3 节公式求 target/place 坐标；1.002 线框高亮；左键挖（基岩不可）、右键放（与玩家 AABB 相交则禁止）；修改后重建所在区块并按 lx/lz==0/15 连带重建邻区块（经 ChunkMeshManager dispose）。CSS 十字准星。

## 阻塞项与风险
无。（已解决：Arena 预览 iframe 未授予 `allow="pointer-lock"` 导致点击无效 → InputManager 增加拖拽环顾降级模式，见关键决策。）

风险备注：GitHub Pages 的 `github-pages` 环境仅允许 `main` 分支部署，且当前令牌无权修改环境规则；后续如需再次部署需合并 PR 到 main，或由仓库所有者在 Settings → Environments → github-pages 添加 `arena/*` 分支策略（工作流已监听 `arena/**` 推送）。

## 下一步计划（当前任务完成后）
P6 验收（正负轴方向高亮与修改 100% 吻合、边界方块无空洞、脚下放方块不自埋）后进入 P7：BLOCK_REGISTRY、Canvas 程序化纹理图集、UV、1-9 快捷栏。

## 架构快照（当前目录树）
```text
src/
├── main.ts                 # 入口：?seed= 解析，World.generateArea(-2,2)，ChunkMeshManager，Player 驱动相机眼位，Loop / Input / UI
├── player/
│   ├── PhysicsAABB.ts      # AABB 类型、aabbIntersects、boxCollides（仅遍历覆盖的整数格）、sweepAxis（分轴扫掠 + 贴齐 ±SKIN）
│   └── Player.ts           # 0.6×1.8×0.6，眼高 1.62；重力 28 / 终端 50 / 跳跃 8.5；Y→X→Z 子步 ≤0.5；F 切换 survival/fly；y<-30 重生
├── blocks/
│   └── BlockTypes.ts       # BlockId (as const) + 临时纯色表 BLOCK_COLORS + isSolid
├── world/
│   ├── Chunk.ts            # CHUNK_SIZE=16 / CHUNK_HEIGHT=64，Uint8Array(16384)，chunkIndex，越界读返回 AIR，dirty 标记
│   ├── TerrainGenerator.ts # 种子 -> SimplexNoise2D；heightAt(wx,wz)=24+fbm×14；草/土3层/石/基岩
│   └── World.ts            # Map<"cx,cz", Chunk>，getOrCreateChunk，getBlock/setBlock(wx,wy,wz) 经 floorMod 转换
├── utils/
│   ├── prng.ts             # mulberry32 createPRNG、hashSeed(string|number)、hash2D
│   ├── noise.ts            # 手写确定性 2D Simplex（PRNG 洗牌置换表）+ fbm(octaves, lacunarity, persistence)
│   └── math.ts             # floorMod、worldToChunkCoords、chunkToWorld、clamp/lerp/smoothstep
├── mesh/
│   ├── FaceData.ts         # 6 面：dir / normal / 4 corners，FACE_INDICES=[0,1,2,2,1,3]（CCW 朝外）
│   ├── ChunkMesher.ts      # 暴露面剔除；边缘邻居经 world.getBlock 跨区块查询；toGeometry 计算 BoundingBox/Sphere
│   └── ChunkMeshManager.ts # Map<key, Mesh>，rebuild = remove(dispose) + 新建；rebuildDirty / rebuildAll / remove；全空区块不建 Mesh
├── core/
│   ├── Renderer.ts         # WebGLRenderer + PerspectiveCamera + Scene 封装，resize 处理，info.autoReset=false
│   ├── Loop.ts             # rAF 主循环，dt = min(clock.getDelta(), MAX_DELTA=0.1)
│   ├── InputManager.ts     # 按键 Set、mouse delta、滚轮；CaptureMode none/locked/fallback（PointerLock 失败→拖拽环顾）
│   └── FirstPersonCamera.ts# YXZ 欧拉、pitch 钳制、setEyePosition（位移由 Player 决定）
└── ui/
    ├── DebugOverlay.ts     # F3 调试面板：FPS / Frame ms / Draw Calls / Triangles / Geometries / Pos / Chunk / Yaw / Pitch
    ├── PauseOverlay.ts     # 未捕获输入时的菜单层（ESC 回显）+ setStatus 状态提示
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
- [2026-11-22 / P3] 噪声选型：**手写 2D Simplex**（Stefan Gustavson 公式，置换表由 Mulberry32 Fisher–Yates 洗牌），未引入 `simplex-noise` 库，依赖清单保持仅 `three`。
- [2026-11-22 / P3] 地形参数：`heightAt = clamp(floor(24 + fbm(wx/64, wz/64, 3 octaves) × 14), 1, 63)`；实测高度范围 [12, 35]，相邻列最大高差 2。`SEA_LEVEL=20` 常量已预留给 P11 水体。
- [2026-11-22 / P3] 坐标铁律落地：`worldToChunkCoords` 先 `Math.floor` 再 `floorMod`，脚本验证 `[-40, 40]` 全范围 `cx*16+lx === floor(wx)`；`x=0` 两侧高度巧合率 9.7%（无镜像）。
- [2026-11-22 / P3] 确定性验证：同 seed 25 区块字节级一致；单独生成 (1,1) 与批量生成一致（与顺序无关）；不同 seed 差异 49,713 字节。`src/` 中 `Math.random` = 0 处。
- [2026-11-22 / P3] 性能基线（P4 优化前，仅区块内剔除）：25 区块 Draw Calls = 25；总面数由 F3 "Faces" 行实时显示，P4 将以此为基准计算压缩率。
- [2026-11-22 / P4] Mesher 引入 `BlockSource` 接口（仅 `getBlock(wx,wy,wz)`），区块内部邻居直接读本地数组（快路径），仅 x/z 越界时走 `world.getBlock`；未传 world 或邻居区块未加载时按 AIR 处理（保留外墙，P10 加载邻居后 dirty 重建即可消除）。
- [2026-11-22 / P4] 性能日志：5×5 区块，面数 53,716 → 24,790（**−53.8%**，移除 28,926 面 == 2 × 内部接缝实心接触数，精确吻合）；顶点 214,864 → 99,160；三角形 49,580。脚本扫描 3 个区块全部输出面，邻居为实心的"漏网面" = 0。
- [2026-11-22 / P4] 显存管理集中到 `ChunkMeshManager`：任何重建/移除路径都经 `remove(key)` → `scene.remove` + `geometry.dispose()`；Mesh 使用 `matrixAutoUpdate=false` 减少每帧矩阵更新。
- [2026-11-22 / 排障] **Pointer Lock 在嵌入式预览中被拒**：Arena 预览 iframe 无 `allow="pointer-lock"`。`InputManager` 引入 `CaptureMode = none | locked | fallback`：同步异常 / Promise 拒绝 / `pointerlockerror` / 400ms 无 `pointerlockchange` 任一发生即进入 fallback（按住鼠标拖动旋转视角，ESC 回菜单）。游戏逻辑统一使用 `input.active` 而非 `locked`。
- [2026-11-22 / P5] 物理参数：重力 28、终端速度 50、跳跃初速 8.5（实测跳高 1.22 格）、步行 4.3、冲刺 ×1.6。水平速度直接赋值无惯性（Minecraft 手感）。为保证面贴齐精确，单次子步每轴位移 ≤ 0.5 格（`steps = ceil(max|d|/0.5)`），配合 dt≤0.1 与终端速度，从 y=60 以 dt=0.1 自由落体不穿地。
- [2026-11-22 / P5] 相机与实体解耦：`FirstPersonCamera` 只管 yaw/pitch 与 `setEyePosition`；`Player` 持有 position/velocity/AABB，每帧 `update(dt, yaw)` 后把眼位（脚 + 1.62）写回相机。
- [2026-11-22 / 部署] 新增 `.github/workflows/deploy.yml`（pnpm → `pnpm build` → upload-pages-artifact → deploy-pages），`vite.config.ts` `base: './'`。`github-pages` 环境仅允许 `main`，故通过 PR #1 合并到 main 触发部署；线上地址 https://imfufuu.github.io/minecraft-web-edition/ 。
