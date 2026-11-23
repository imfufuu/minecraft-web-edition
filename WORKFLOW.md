# Minecraft Web Edition — Workflow

## 当前阶段
P11 — 可选进阶特性（树木 → 水面 → 昼夜）

## 阶段状态机
| 阶段 | 名称 | 状态 | 验收标准是否满足 | 核心指标记录 (DrawCalls/FPS等) | 备注 |
|---|---|---|---|---|---|
| P0 | 项目脚手架与调试面板 | done | yes | DrawCalls=2 (cube+grid), Triangles≈12+grid lines | Vite 8 + TS 7 + three 0.187 |
| P1 | 渲染循环与第一人称相机 | done | yes | DrawCalls=2, 60/144Hz 位移一致 (speed×dt) | YXZ 欧拉, pitch ±(90°−0.57°) |
| P2 | 体素数据模型与单区块渲染 | done | yes | DrawCalls=1；满区块 4608 面（理论值一致）；12 个三角形 CCW 校验通过 | Uint8Array + 暴露面剔除 |
| P3 | 区块化世界与种子地形 | done | yes | 25 区块 / DrawCalls=25；同 Seed 字节级一致；负坐标往返校验通过 | 手写 Simplex2D + 3 层 fBm |
| P4 | 跨区块面剔除与网格合并 | done | yes | 25 区块面数 53,716→24,790（−53.8%），顶点 −53.8%；DrawCalls ≤ 视野内区块数，背对时 0 | 移除面数 == 理论接缝数 |
| P5 | 玩家物理与 AABB 碰撞 | done | yes | 静止 120 帧 y 唯一值=1；贴墙滑行 x 钉 4.6999；跳跃 1.22 格；dt=0.1 不穿地 | Y→X→Z 分轴扫掠，子步 ≤0.5 |
| P6 | 方块交互（挖掘/放置） | done | yes | DDA 与 7.3 公式 32/32 一致；边界挖掘 leaked=0；重建 2 次 → dispose 2 次 | 体素 DDA，无需 Raycaster |
| P7 | 快捷栏、注册表与程序化纹理 | done | yes | 12 tile 确定性图集（字节级一致）；10 种方块；Textures=1；UV 内缩 0.001 | DataTexture + Nearest + sRGB |
| P8 | 顶点光照与环境光遮蔽(AO) | done | yes | 无灯光 MeshBasicMaterial；AO 值手算全对（1.0/.82/.65/.45）；镜像对称；24 三角形 CCW | F4 AO / F6 明暗 开关 |
| P9 | IndexedDB 增量存档与恢复 | done | yes | 放置/破坏→flush→重新 bootstrap：方块/位置/热栏/模式全部恢复；save 1.3 ms；clearAll 后为新世界 | 存档仅含 diff，不存整区块 |
| P10 | Web Worker 多线程与视距卸载 | done | yes | rd=7 → 177 区块；Worker 内生成+网格 ≈5.5 ms/块；主线程 ≤2 上传/帧；远离后 69/69 网格全部 dispose；Worker 输出与主线程逐字节一致 | Worker 包 7.9 kB，不含 three |
| P11 | 可选进阶特性 | in-progress | no | - | 顺序：树木 → 水面 → 昼夜 |

## 当前任务
P11-a 树木：`world/Structures.ts` 用 `hash2D(seed, wx, wz)` 决定每列是否为树心（概率约 1/180，仅草地且 h>SEA_LEVEL+1），树形确定性（干 4–6 格 OakLog + 半径 2 球冠 Leaves）；生成写入 padded 体积时需考虑邻近 2 格内其他区块的树冠（在 padded 生成阶段对 [-3,18] 范围的树心做结构叠加，保证跨区块树冠无缝且与加载顺序无关）；主线程 `TerrainGenerator.generate` 与 padded 路径共用同一结构函数，保持逐字节一致。

## 阻塞项与风险
无。

风险备注：GitHub Pages 的 `github-pages` 环境仅允许 `main` 分支部署且令牌无权修改环境规则；每次部署需 PR 合并到 main（或由所有者在 Settings → Environments → github-pages 添加 `arena/*` 分支策略）。

风险备注：Worker 路径与主线程 `rebuildDirty` 路径在**视距边缘**可能不一致：主线程重建（玩家编辑后）对未加载邻区块按 AIR 处理，而 Worker 用 padded 生成数据。只影响被编辑且位于加载边缘的区块，玩家靠近后邻区块加载即恢复。

## 下一步计划（当前任务完成后）
P11-b 水面（SEA_LEVEL=20 以下填 Water，半透明第二材质/第二网格，仍 ≤2 draw calls/区块）；P11-c 昼夜（天空色 + 顶点色全局乘数 uniform，不重建网格）；P11-d Greedy Meshing（可选，需与 AO 兼容：仅合并 AO 四角相同的面）。

## 架构快照（当前目录树）
```text
src/
├── main.ts                 # 入口：async bootstrap；?seed= / ?rd= 解析；ChunkLoader 流式加载；Player 驱动相机眼位；Loop / Input / UI
├── player/
│   ├── PhysicsAABB.ts      # AABB 类型、aabbIntersects、boxCollides（仅遍历覆盖的整数格）、sweepAxis（分轴扫掠 + 贴齐 ±SKIN）
│   ├── Player.ts           # 0.6×1.8×0.6，眼高 1.62；重力 28 / 终端 50 / 跳跃 8.5；Y→X→Z 子步 ≤0.5；F 切换 survival/fly；y<-30 重生
│   └── BlockInteraction.ts # 每帧 DDA(far=6) → hit；1.002 EdgesGeometry 高亮；dig（基岩不可）/ place（与玩家 AABB 相交拒绝）；按住自动重复
├── utils/
│   └── raycast.ts          # raycastVoxels（Amanatides–Woo DDA，返回整数坐标+法线+命中点）、getTargetAndPlaceBlockCoords（7.3 参考公式）
├── blocks/
│   ├── BlockTypes.ts       # BlockId (as const，11 种含 AIR) + isSolid
│   └── BlockRegistry.ts    # BlockDef{top,side,bottom tile, breakable}，getFaceTile(id, face)，HOTBAR_BLOCKS
├── world/
│   ├── Chunk.ts            # CHUNK_SIZE=16 / CHUNK_HEIGHT=64，Uint8Array(16384)，chunkIndex，越界读返回 AIR，dirty 标记
│   ├── TerrainGenerator.ts # 种子 -> SimplexNoise2D；heightAt(wx,wz)=24+fbm×14；草/土3层/石/基岩
│   ├── World.ts            # Map<"cx,cz", Chunk>，getOrCreateChunk(叠加 diff)，getBlock/setBlock(记录 modifiedBlocks)，applyDiff；边界修改连带标记邻区块 dirty
│   └── WorldStorage.ts     # IndexedDB MinecraftWebDB v1：meta(seed, player) + chunk_diffs(Uint16 index / Uint8 id)；无 IDB 时 no-op
├── utils/
│   ├── prng.ts             # mulberry32 createPRNG、hashSeed(string|number)、hash2D
│   ├── noise.ts            # 手写确定性 2D Simplex（PRNG 洗牌置换表）+ fbm(octaves, lacunarity, persistence)
│   └── math.ts             # floorMod、worldToChunkCoords、chunkToWorld、clamp/lerp/smoothstep
├── mesh/
│   ├── FaceData.ts         # 6 面：dir / normal / 4 corners，FACE_INDICES=[0,1,2,2,1,3]（CCW 朝外）
│   ├── TileIds.ts          # 图集 tile 索引（12 个）
│   ├── TextureAtlas.ts     # paintAtlas(seed) 纯 TS 像素绘制 → RGBA；DataTexture(Nearest, sRGB)；getTileUV(内缩 0.001)；canvas 副本供缩略图
│   ├── AtlasLayout.ts      # 图集常量 + getTileUV（无 three 依赖，供 Worker 使用）
│   ├── Lighting.ts         # FACE_SHADE、AO_CURVE、vertexAO(side1,side2,corner)、QUAD_INDICES(_FLIPPED)、shouldFlipQuad
│   ├── ChunkMesher.ts      # 暴露面剔除；跨区块 solidAt；UV；顶点色 = shade × AO；对角线翻转；options{ao, shading}
│   └── ChunkMeshManager.ts # Map<key, Mesh>，rebuild = remove(dispose) + 新建；rebuildDirty / rebuildAll / remove；全空区块不建 Mesh
├── core/
│   ├── Renderer.ts         # WebGLRenderer + PerspectiveCamera + Scene 封装，resize 处理，info.autoReset=false
│   ├── Loop.ts             # rAF 主循环，dt = min(clock.getDelta(), MAX_DELTA=0.1)
│   ├── SaveManager.ts      # 5 s 周期 + 1.5 s 编辑防抖自动保存；visibilitychange/pagehide flush；并发合并
│   ├── InputManager.ts     # 按键/鼠标键 Set、mouse delta、滚轮；CaptureMode none/locked/fallback；fallback 用 Pointer Events 差分（鼠标/触屏），轻点=点击、长按=右键
│   └── FirstPersonCamera.ts# YXZ 欧拉、pitch 钳制、setEyePosition（位移由 Player 决定）
├── vite-env.d.ts           # __BUILD_ID__ 声明（vite define 注入 git hash + 时间）
└── ui/
    ├── DebugOverlay.ts     # F3 调试面板：FPS / Frame ms / Draw Calls / Triangles / Geometries / Pos / Chunk / Yaw / Pitch
    ├── PauseOverlay.ts     # 菜单层 + setStatus 状态提示 + setDiagnostics 诊断行（构建号等）
    ├── ErrorBar.ts         # window error / unhandledrejection → 屏幕顶部红色错误条
    ├── TouchControls.ts    # 虚拟摇杆（setMoveAxis）、▲跳/上、▼下、飞行按钮；右上常驻 F3 / ☰ 按钮
    ├── Hotbar.ts           # 9 格快捷栏：Digit1-9（onKeyPress）、滚轮（consumeWheel）、触屏点选；缩略图来自图集
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
- [2026-11-22 / 排障②] 用户反馈 Pages 上也无法锁定/拖拽。建立 **无头冒烟测试 `pnpm smoke`**（`test/headless/`：jsdom + 以别名替换 `three` 的 `WebGLRenderer` 为桩，真实执行 `bootstrap()` 与主循环），三条指针锁定路径均通过 → 逻辑无断点。加固：fallback 改用 Pointer Events + `clientX/Y` 差分（不依赖未锁定时可能为 0 的 `movementX`，触屏可用，`touch-action:none`）；新增 `ErrorBar`（全局错误上屏）与菜单诊断行；`THREE.Clock` 已弃用 → `Loop` 改用 `performance.now()`（消除控制台警告）。`main.ts` 导出 `bootstrap()` 并挂 `window.__mwe` 供调试。
- [2026-11-22 / P6] 射线拾取选用 **体素 DDA**（Amanatides–Woo）而非 `THREE.Raycaster` 扫 Mesh：O(距离) 且直接得到整数坐标与面法线，无需 ±0.001 微移；已验证与 7.3 节参考公式在 32 组正负方向样本上完全一致（参考公式保留在 `utils/raycast.ts`）。
- [2026-11-22 / P6] 邻区块重建责任放在 `World.setBlock`（数据层知道 lx/lz 边界），渲染层只消费 dirty 标记；角块一次修改最多标记 3 个区块。显存：每次重建 1 次 `geometry.dispose()`（计数验证）。
- [2026-11-22 / P6] 降级（拖拽）模式下左键既是环顾键又是挖掘键 → 以"按下→抬起 <300ms 且位移 <4px"识别为点击；触屏长按 500ms = 右键放置。
- [2026-11-22 / 触屏] iPad 反馈"拖动尺度偏小"：触屏指针差分 × `touchLookScale=2.2`（全屏宽约 300°），另加用户可调 `lookSensitivity`（0.3–3×，localStorage 持久化）。无键盘设备：`TouchControls` 提供摇杆（模拟轴并入 `Player.computeWishDirection`，|wish|≤1 带幅度）与 ▲/▼/飞行按钮（虚拟按键走同一 `isDown`），右上角常驻 **F3** 与 **☰** 按钮替代键盘。触屏控件自动在 `maxTouchPoints>0` 启用，菜单可手动开关。
- [2026-11-22 / P7] 纹理图集采用 **纯 TS 像素绘制器 → RGBA 缓冲 → `THREE.DataTexture`**（而非直接 CanvasTexture）：像素完全相同，但可在 Node 中做字节级确定性断言并导出 PNG 目视检查，无 `flipY` 歧义，无头冒烟测试不依赖 canvas 2D。浏览器中由同一缓冲生成 `<canvas>` 仅用于快捷栏缩略图。
- [2026-11-22 / P7] 地形新增海滩：`h ≤ SEA_LEVEL+1` 的列顶层与 3 层表土为 SAND（仍完全确定性，5×5 区块 13,028 块沙）。
- [2026-11-22 / P7] 性能：纹理数 1（单图集），Draw Calls 不变（≤ 视野内区块数），单区块顶点新增 uv 属性（+8 B/顶点）。
- [2026-11-22 / P8] AO 邻居采样按**法线轴通用推导**切向两轴（无需 6 面 × 4 角手写表）：对角 `(ox+sx, oy+sy, oz+sz)`，两侧各置零一个切向分量；采样走与剔除相同的 `solidAt`（区块内直读，越界经 `world.getBlock`），因此邻区块方块能正确影响本区块边缘 AO。
- [2026-11-22 / P8] 顶点顺序为 Z 形（0 左下、1 右下、2 左上、3 右上），默认对角线 1–2，翻转对角线 0–3（索引 `[0,1,3,0,3,2]`，已验证 CCW 且面积和为 1）；翻转条件 `ao1+ao2 > ao0+ao3`，即"对角线连向更暗的一对"（0fps 规则），与规范循环顺序下的 `ao0+ao2 > ao1+ao3` / `[1,2,3,1,3,0]` 等价。
- [2026-11-22 / P8] 光照完全烘焙进顶点色，材质改为无光照 `MeshBasicMaterial({map, vertexColors})` 并移除 Ambient/Directional 灯光：每帧 GPU 光照成本为 0；F4/F6 切换时 `rebuildAll()` 经 dispose 重建。F5 保留给浏览器刷新（P9 验收需要）。
- [2026-11-22 / P8] 性能：顶点数/面数与 P7 相同（AO 只改变颜色属性与索引顺序），Draw Calls 不变。
- [2026-11-22 / P9] 存档粒度 = 稀疏 diff：`World.setBlock` 只记录玩家修改（`Map<chunkKey, Map<flatIndex, id>>`，破坏记为 AIR 而非删除条目），区块重新生成后叠加 diff；因此存档大小与修改数成正比，与世界大小无关，且 P10 卸载区块时 diff 保留在内存，不会丢失。
- [2026-11-22 / P9] IndexedDB 记录用 `Uint16Array indices + Uint8Array ids` 结构化克隆，而非 JSON 字符串：100 次修改约 300 B。`WorldStorage` 在无 IndexedDB 环境下自动降级为 no-op，并在菜单提示。
- [2026-11-22 / P9] Seed 优先级：URL `?seed=` > 存档 seed > 默认；若 URL seed 与存档不同则清空旧存档（diff 不能跨 seed 复用）。"新建世界"写入时间哈希的新 seed 后刷新页面（去掉 `?seed=`）。
- [2026-11-22 / P9] `bootstrap()` 变为 async（需先读 meta 才能决定 seed）；smoke 测试引入 `fake-indexeddb`（dev 依赖）做真实的 编辑→flush→二次 bootstrap 复原验证：方块 7、位置 (4.25,27,−2.5)、diffs=1、unsaved=0，保存耗时 1.3 ms。
- [2026-11-22 / P10] Worker 内用 **padded 18×H×18** 体积生成并直接网格化（跨区块剔除 + AO 都在 Worker 完成），主线程只做 `BufferGeometry` 上传（≤2/帧，实测 ≈0.3 ms/块）。因 padded 环来自同一确定性生成器，区块网格与加载顺序无关，无需"邻居到达后重建"。玩家编辑通过请求携带本块+8 邻块的 diff（Uint16/Uint8 数组）在 Worker 内叠加；若作业在途期间发生编辑且邻块有 diff，则安装后标记 dirty 由主线程重建。
- [2026-11-22 / P10] 为了让 Worker 包不含 three（7.9 kB vs 115 kB），把 `getTileUV`/图集常量拆到 `AtlasLayout.ts`，`toGeometry` 移到 `ChunkMeshManager.buffersToGeometry`；`ChunkMesher` 现在零 three 依赖。
- [2026-11-22 / P10] 验证：padded 内核与 `TerrainGenerator.generate` 逐字节一致（含负坐标）；Worker 流水线输出（data/positions/indices/colors/uvs/normals）与主线程 mesher 逐字节一致（3 块 2164 面）；邻块 diff 缺失时恰好少 1 个边界面（证明 diff 传递必要且生效）；rd=4 流式加载 69/69，远离后 69 网格全部 dispose、面计数归零，返回后被编辑区块通过 builder 重新叠加 diff；60 步行走峰值 71 块（上限 169）。打包后的 worker 在 Node 中独立运行 20 块：平均 5.5 ms/块，Transferable 6 个缓冲。
- [2026-11-22 / P10] 生存模式下脚下区块未加载时物理暂停（`Player.groundReady`），避免穿透未加载地形；出生/读档所在区块在 bootstrap 内同步构建（≈3 ms）。`?rd=N` (2–12) 可调视距。
