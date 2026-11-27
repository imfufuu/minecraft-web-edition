# minecraft-web-edition

WebGL 版 3D 体素世界（three.js + Vite + TypeScript），浏览器端全部运行；
分块用 Worker 多线程生成+网格化，生存物理用 AABB 分轴碰撞。

## 运行与测试

```sh
pnpm install           # 首次安装依赖（pnpm，Lockfile 锁定）
pnpm dev               # 开发服：http://localhost:5173（bind 0.0.0.0）
pnpm typecheck         # tsc --noEmit（strict + noUnusedLocals 等）
pnpm build             # tsc --noEmit && vite build → dist/
pnpm preview           # 预览构建产物
pnpm smoke             # headless jsdom 冒烟测试（三种指针锁定路径 + 存档往返）
pnpm test              # pnpm smoke 的别名
```

## URL 参数

- `?seed=<字符串>` — 加载指定种子的世界（优先于存档）。
- `?rd=<2–12>` — 视距（区块数，默认 7）。
- `?day=<0–1 或 HH:MM>` — 固定昼夜相位（默认跟随时钟）。

## 操作

| 操作 | 按键 / 手势 |
|---|---|
| 移动 | W / A / S / D（触屏：摇杆） |
| 方向 | 鼠标移动（Pointer Lock 模式）或长按拖动 |
| 跳跃 | Space（水中上浮） |
| 冲刺 | Ctrl（飞行中为 ×2.5） |
| 飞行 / 生存切换 | F（Space/Shift 升降） |
| 挖掘 / 放置 | 左键 / 右键（命中距离 6 格内） |
| 快捷栏 | 滚轮 / 1–9（方块来自程序化图集） |
| 调试面板 | F3（FPS、位置、区块、面数…） |
| 调试开关 | F4（AO）/ F6（方向阴影） |
| 菜单 / 释放鼠标 | ☰ / ESC |

## 存档

IndexedDB（`MinecraftWebDB`）按块 diff 增量保存（菜单可手动保存，或 5 秒周期自动保存）；
浏览器不支持时自动降级为无存档提示。

设计记录与完整的阶段清单见 [WORKFLOW.md](WORKFLOW.md)。
