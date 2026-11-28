# Minecraft Web Edition — 路线图（P0–P11）

编写于 2026-11-27（今天）。P0–P10 已全部完成（状态见 `WORKFLOW.md` 日志），P11 为进行中。
执行前请阅读 [`AGENT_WORKFLOW.md`](AGENT_WORKFLOW.md)（Agent 工作流规范）。

> 关键指标记录（性能/功能）见 `WORKFLOW.md`；本文侧重 **计划** 与 **验收标准**。

---

## P0 — 项目脚手架与调试面板 · 已完成

- **目标**：Vite 8 + TypeScript 7 + three 0.187 严格基础；入口 `main.ts` 导出 `bootstrap()`；全局错误可视化（`ErrorBar`）；DebugOverlay（F3）。
- **里程碑**：
  1. `package.json`：dev/build/typecheck/preview/smoke 脚本（build = `tsc --noEmit && vite build`）。
  2. `tsconfig.json`：strict + `noUnusedLocals/noUnusedParameters` + `noUncheckedIndexedAccess` 关闭等。
  3. `index.html` + `src/main.ts` 模块化入口；`window.__mwe` 调试挂点。
  4. `DebugOverlay`：FPS/Frame/DrawCalls/Triangles/Pos/Chunk + 扩展 line 注册接口。
  5. 无头冒烟测试骨架 `test/headless/`（jsdom + fake-indexeddb + `three` 别名桩）。
- **验收**：`pnpm typecheck` 零错误；`pnpm smoke` 三路通过。

## P1 — 渲染循环与第一人称相机 · 已完成

- **目标**：`Loop`（rAF + `performance.now()`，MAX_DELTA=0.1）；`FirstPersonCamera`（YXZ 欧拉，pitch 限制 ±(90°−0.01°)，yaw 限制 [−π, π)）。
- **里程碑**：
  1. `Loop.onUpdate/onRender/start/stop`，更新在前、渲染在后。
  2. 相机位置由 `Player.getEyePosition`（脚 + PLAYER_EYE_HEIGHT=1.62）写入，与物理解耦。
- **验收**：60/144Hz 位移一致（speed×dt）。

## P2 — 体素数据模型与单区块渲染 · 已完成

- **目标**：`Chunk`（16×64×16，Uint8Array + dirty 标记）；单块 `ChunkMesher`（面剔除 + CCW + `THREE.BufferAttribute`）。
- **里程碑**：
  1. `ChunkMeshManager`：每块最多 2 个 Mesh（不透明+水），几何体替换必 `dispose`。
  2. `ChunkMesher.build(chunk, world?)` 基础版：`isOpaque` 剔除。
- **验收**：DrawCalls=1（单块），满块面数≈4608。

## P3 — 区块化世界与种子地形 · 已完成

- **目标**：`World`（Map<"cx,cz">）+ `TerrainGenerator`（4 路 Simplex fBm：高度/温度/湿度/崎岖）+ `Biomes`（8 群系）。
- **里程碑**：
  1. `TerrainGenerator.heightFor/columnAt/fillColumn`：海平面填水（h+1..SEA_LEVEL=20）。
  2. 同 Seed 二次生成逐字节一致（5×5 区块同 Hash）。
- **验收**：25 区块/DrawCalls=25；负坐标往返校验（`worldToChunkCoords` 含 `floorMod`）。

## P4 — 跨区块面剔除与网格合并 · 已完成

- **目标**：padded 18×H×18 生成（`PaddedChunk.generatePaddedChunk`）+ 跨块剔除/AO；`ChunkLoader` 流式加载。
- **里程碑**：
  1. `PaddedBlockSource`：把 `ChunkMesher` 跑在“无邻块已存在”的环境。
  2. `ChunkLoader`：螺旋队列、worker 池、主线程≤2 上传/帧、>rd+2 卸载+dispose。
- **验收**：面数 53,716→24,790（−53.8%），顶点同步 −53.8%；Worker 与主线程输出逐字节一致。

## P5 — 玩家物理与 AABB 碰撞 · 已完成

- **目标**：`Player`（0.6×1.8×0.6，眼高 1.62）+ `PhysicsAABB.sweepAxis`（Y→X→Z 分轴扫掠 + 贴齐 SKIN）。
- **里程碑**：
  1. 生存：重力 GRAVITY=28、终速 50、跳跃 8.5、步行 4.3、冲刺 ×1.6；水浮力/下沉/上浮。
  2. `groundReady` 门：未加载列时暂停生存物理（防穿透未加载地形）。
  3. 子步 `MAX_STEP=0.5` 保证面贴齐；F 键切换生存/飞行。
- **验收**：静止 120 帧 y 唯一值=1；贴墙滑行 x 钉 4.6999；跳跃 1.22 格；dt=0.1 不穿地。

## P6 — 方块交互（挖掘/放置）· 已完成

- **目标**：`BlockInteraction`（`raycastVoxels` Amanatides–Woo DDA + `VoxelHit{x,y,z,nx,ny,nz,distance,px,py,pz}`）。
- **里程碑**：
  1. `REACH_DISTANCE=6`；挖掘（BEDROCK 不可）。
  2. 放置：命中法线 ±1、阻挡 y<0/≥CHUNK_HEIGHT、与玩家 AABB 重叠拒绝。
  3. 按住自动重复（REPEAT_MS=250）；高亮 EdgesGeometry。
- **验收**：体素 DDA 与 7.3 参考公式 32 组正负样本一致；挖边界 leaked=0。

## P7 — 快捷栏、注册表与程序化纹理 · 已完成

- **目标**：`Hotbar`（9 槽，`HOTBAR_BLOCKS`）+ `BLOCK_REGISTRY`（BlockDef/`getFaceTile`）+ `TextureAtlas`（纯 TS 像素绘制 → `THREE.DataTexture`, 16 tile, 纯色变体）。
- **里程碑**：
  1. `TileIds`/`Tile`：Grass/GrassSide/Dirt/Stone/Bedrock/Sand/Logs/Leaves/Planks/Brick/Cobblestone/Water/Snow/Cactus 等。
  2. `AtlasLayout`/`TextureAtlas.canvas`：无 headless canvas 可用（jsdom 走路径）。
- **验收**：12 tile 确定性图集（字节级一致）；Textures=1。

## P8 — 顶点光照与环境光遮蔽（AO）· 已完成

- **目标**：`ChunkMesher` AO（`vertexAO`，三角对角翻转 `shouldFlipQuad`）+ `Lighting.FACE_SHADE/AO_CURVE` + `DayNight.attach` 单 uniform 注入。
- **里程碑**：
  1. 顶点色 = shade × AO；AO 值 1.0/.82/.65/.45（镜像对称）。
  2. F4 切换 AO、F6 切换方向阴影（`rebuildAll()`）。
- **验收**：24 三角形 CCW；光照完全烘焙进顶点色。

## P9 — IndexedDB 增量存档与恢复 · 已完成

- **目标**：`WorldStorage`（meta+chunk_diffs 存 Uint16 indices / Uint8 ids）+ `SaveManager`（5 s 自动 + 即时保存、页面隐藏 flush）。
- **里程碑**：
  1. 稀疏 diff：`World.setBlock` 记录 `modifiedBlocks` + `unsavedDiffs`；卸载后 diff 保留。
  2. Seed 优先级：URL `?seed=` > 存档 > 默认 `DEFAULT_SEED='minecraft-web'`；diff 不跨 Seed 复用。
- **验收**：放置/破坏→flush→二次 bootstrap：方块/位置/热栏/模式全部恢复（save ≈1.3 ms）。

## P10 — Web Worker 多线程与视距卸载 · 已完成

- **目标**：`workers/protocol.ts` + `chunk.worker.ts` + `ChunkBuilder`（纯 TS）+ `ChunkLoader` 池（`min(4, cores−1)`，球体≈5.5 ms/块）。
- **里程碑**：
  1. `PaddedChunk`：padded 环与主线程一致（含负坐标）。
  2. 编辑在途：`diff` 携带本块+邻块，安装后若邻块有 diff → `dirty` 重建。
  3. `?rd=N`（2–12）渲染距；>rd+2 卸载并 `dispose` 网格。
- **验收**：主线程≤2 上传/帧；卸载后全部 dispose、面计数归零；Worker/主线程输出逐字节一致。

## P11 — 进行中（可选进阶特性）

### 已完成（验收详见 WORKFLOW.md 日志）
- **树木**：`TreePlacer` 纯函数 `(seed, wx, wz) → Tree|null`，候选 hash < 群系 chance，5×5 邻域“更小 hash 无人”规则（天然间距≥3），干高 4–6；`stamp()` 扫描缓冲外扩 2 格。13×13 区块 ≈142 棵，跨块无缝。
- **水面**：`BlockId.WATER=11`，水面**只对 AIR** 输出（水-水、水-固体不出面），顶面下沉 0.125，不做 AO；每列恰 1 个水顶面（h∈(20,64]）。
- **昼夜**：`DayNight`（600 s/日，φ∈[0,1)），`uDaylight` 单 uniform（0.25+0.75·smoothstep(−0.15,0.2,sin2πφ)），雾色同步，`?day=0.3|06:00` 固定，菜单打开暂停。
- **天体/云**：`Sky`（日/月/星，4 DrawCalls）+ `Clouds`（MC fancy，12 格×4 厚，37×37 格 496 云 ≈1396 面，东漂 0.6 格/s，基于玩家相对云场的 ≥2 格触发重建）。
- **触控**：`TouchControls` 摇杆（`setMoveAxis` 并入 `Player.computeWishDirection`, |wish|≤1）+ ▲/▼/飞行按钮（虚拟键 `setVirtualKey`）+ F3/☰ 常驻；`TouchGuards` 全局防选中/缩放/滚动；⛶ 全屏。
- **群系**：3 路气候噪声（T 1/300, H 1/300，崎岖 1/220）+ 山地（≥38 裸石、≥48 积雪、上限 60）+ 仙人掌（沙漠，1–3 高）。

### 计划中（剩余工作）
1. **收尾文档化**：README（操作说明、URL 参数、架构图）+ 性能基线表（各阶段 DrawCalls/FPS）+ 已知问题清单（iframe 指针锁定、视距边缘重建差异、iPhone 无全屏 API、老存档在群系改版后地形变化）。
2. **未决改进（风险备忘）**：
   - `ChunkLoader.recenter()` 路径：in-flight worker 任务可能在区块被卸载后仍 `installResult`（需规定是否加“install 前对路径复查”）。
   - 主线程 `rebuildDirty` 与 Worker padded 输出在**视距边缘**可能不一致（只影响被编辑且位于加载边缘的区块）。
3. **可选进阶（按用户反馈迭代）**：雪地结冰水面、群系草色顶点着色、音效、移动端跳跃键布局；Greedy Meshing（需 fract UV + 额外属性，复杂度高、收益在面数而非瓶颈）**决定跳过**（已记录）。

---

# P12–P21 — 完整版 Minecraft 网页版路线（新增 10 个阶段，均“未开始”）

> 基于现有架构（路线图 P0–P11）的延伸：以上里程碑需要与现有文件结构商定（新文件约定见每阶段“里程碑 1–2”）。
> 任务按 [`AGENT_WORKFLOW.md`](AGENT_WORKFLOW.md) 的工作流执行。

## P12 — 地形完善与群系扩展（雨林/沼泽/高原/海岛）· 未开始

- **目标**：表层多样性 + 新增群系。
- **里程碑**：
  1. 新群系定义：丛林、沼泽、高原、海岛等加入 `Biomes.ts`（沿用 `BiomeDef` 字段：top/filler/fillerDepth/treeChance 等）。
  2. 表层规则：沼泽树木、高原悬崖斜坡、海岛沙滩分层。
- **验收**：1 km² 普查出现新群系；Worker/主线程逐字节一致。

## P13 — 生物：动物（绵羊/牛/猪/鸡/兔）· 未开始

- **目标**：实体系统（动物）。
- **里程碑**：
  1. `src/entity/Entity.ts`：实体基类（`World` 管理、AABB 碰撞、`update(dt)`、跟随玩家距离生成/卸载）。
  2. `src/entity/Animals.ts`：动物类型（漫游/避障，玩家靠近时切跟随）。
  3. 渲染：Billboard Sprite（围绕相机旋转的平面贴图）。
  4. 存档：实体差分（`WorldStorage` 新增 `entities` store，或复用 diff 存档）。
- **验收**：动物在加载区域内移动不穿地；保存/加载后仍在位置。

## P14 — 结构生成（矿井/废弃矿坑/堡垒）· 未开始

- **目标**：世界结构生成。
- **里程碑**：
  1. `Structures.ts` 扩展：`Mineshaft`（门廊 + 走廊）、`Ravine`（废弃矿坑）、`Stronghold`（异种人）。
  2. `StructurePlacer`：种子位置查找（按群系位置 + 距离记录），结构在加载时写入 `World`。
- **验收**：13×13 区块内能见到至少一个结构。

## P15 — 红石与电路系统· 未开始

- **目标**：可玩的红石/门禁系统。
- **里程碑**：
  1. 新 BlockId：红石粉/火把/灯/门（剩余空位递增）。
  2. 仿真：`RedstoneSystem`（状态变化推扩 + 每帧 `update`）。
  3. 简单电路：点亮灯、铁门开关、压力板激活。
- **验收**：可玩（按拉杆开关灯/门）。

## P16 — 工具、盔甲与配方系统· 未开始

- **目标**：战利品系统 + 合成表。
- **里程碑**：
  1. `Recipes.ts`：配方表（`shaped`/`shapeless`，材料档：木板/矿石等）+ `CraftingTable` 网格排布。
  2. `Tools.ts`：镐/斧/铲/剑（耐久、伤害、挖类型、采集速度）。
  3. `Armor.ts`：头/胸/腿/鞋（护甲值接入 `Player`）。
- **验收**：镐比石头破石块更快；穿戴盔甲后护甲值>0。

## P17 — 健康与饥饿系统（饥饿/死亡/出生点）· 未开始

- **目标**：玩家生存状态。
- **里程碑**：
  1. `Player` 扩展：+ `health`（单位1）、`hunger`、`exhaustion`（每秒消耗 + 移动/爬墙计入）。
  2. UI：健康/饥饿条（`src/ui/SideHud.ts`）。
  3. 死亡/出生点：死亡回到出生点，`Bed` 可更新出生点。
- **验收**：30 秒后饥饿影响移动；死亡后位置回到出生点。

## P18 — 环境与天气（雨、雪、冰）· 未开始

- **目标**：天气系统。
- **里程碑**：
  1. `Weather.ts`：雨（粒子 + 体积云）、雷、雪（粒子 + 体积云）、冰（从上方生长的坚冰）。
  2. `Particles.ts`：GPU 实例化粒子（雨滴/雪花 1000+），主循环零分配。
  3. 整合：`DayNight` 暴露 `isRaining/isSnowing`；冰用玻璃材质。
- **验收**：需实例化粒子渲染；玩法可见。

## P19 — UI 与设置完善（设置页、按键绑定、辅助功能）· 未开始

- **目标**：设置/交互完善。
- **里程碑**：
  1. `SettingsPanel.ts`：音量、音效开关、按键绑定。
  2. `InputManager` 扩展：`bindKey(name, code)`，`isDown(name)` 兼容。
  3. `Gamestate`：`menu/settings`，localStorage 持久化。
- **验收**：设置修改后重启保留。

## P20 — 多人联机（WebRTC DataChannels 或 WebSocket）· 未开始

- **目标**：多人体验。
- **里程碑**：
  1. `NetServer.ts`（房间创建/加入）+ `NetClient.ts`。
  2. 同步：位置/看向 + 顶点模式（互相加入/跟随玩家），`Server.syncRate`。
  3. 可选：自建部署。
- **验收**：开发本机可见。

## P21 — 音效与性能收尾· 未开始

- **目标**：收尾。
- **里程碑**：
  1. `SoundManager`：破坏/放置/跳/死亡/工具使用（`WebAudio` 程序化采样）。
  2. 性能：渲染循环分帧 + 实例化粒子，动物循环低频；增加 `benchmark.ts`（帧率基线）。
  3. 收尾：`UPDATE_LOG` 更新，基线对比（性能/场景）。
- **验收**：有声；帧率无明显下降。

---

## 下一步（P12–P21 为完整版 Minecraft 目前未开始；维护方向见 P11 与 `AGENT_WORKFLOW.md`）
项目 P0–P11 已完成；P12–P21 为完整版 Minecraft 网页版路线，任务按 [`AGENT_WORKFLOW.md`](AGENT_WORKFLOW.md) 的工作流执行。
