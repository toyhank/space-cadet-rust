# VPX 网页版本（真实 VPX 碰撞几何 + 游戏规则）

## 2026-10-12：左侧机关与挡板手感专项修复

症状：**左边的机关弹不上去**。测试把球放在本机 JP v4.3 原版 `LeftKickerRest` (x≈0.03905,z≈0.89577)，原实现等待 1.5 秒发射、却只设置 `vz=-1.8`：球在 z≈0.668 撞到 `Bumper7` 后掉回机关中，甚至循环卡球。不是没有计时触发，而是简化求解器没有模拟该通道从低位跨越障碍的空间运动。

改动：

- **左侧回弹器**：仍按照原版脚本 `LeftKickerRest_Hit` 等待 1500ms，给左侧通道专用 `vz=-2.05` 和 `vy=.84`，让球实际**飞越低位 Bumper7**，再通过已经实现的三维重力接触上层 Ramp，而不是在 2D 中穿墙/瞬移。右侧保持原有平面发射特性。实测最低 z 从约 **0.668 改善到 0.397**，球进入 `Ramp009` 且触发 `rampLand/rampRail/rampExit`。
- **Slingshot**：原来仅在原始 Wall（`Leftslingshot/Rightslingshot` 及两侧高位 Slingshot）碰撞时加分、音效，却没有主动电磁冲量。现在撞上之后增加沿桌面向上弹射、适度指向桌面中心的定向冲量。处理顺序放到**全部墙边碰撞位置矫正完成之后**，防止第二次边线求解抵消刚刚弹出的力；保留原版脚本每次 **500 分**。
- **Bumper**：只有新接触且入射速度指向弹射器时才触发一次线圈推力，并设 90ms 冷却，避免以前每个 240Hz 物理子步都叠加能量。
- **Flipper**：按原版转轴/角度运动，仅**挡板还在主动旋转、前面运动方向面对球**时额外给力；停止位置按住不放时只是有弹性的静态拍面。主动挥动仍给球足够的沿桌面向上速度，同时收敛过强的竖直弹跳。
- **手感参数**：沿桌面重力由 0.72 调为 0.96m/s²；滚动、空中及坡面阻尼分别降低到 .19/.07/.24，减少非自然的缓慢滞留。

新增 `tests/vpx-kickback-feel.mjs`：不依赖版权素材的双挡板主动/静态挥动测试可在 GitHub CI 跑；本机再读取原版 VPX 几何分别验证左右自动弹射、左侧高架坡道着陆、左右和高位 Slingshot 主动冲量。真实 Chrome `tests/vpx-play.cjs` 新增原始左侧回弹器出球轨迹以及 `tests/artifacts/vpx-left-kicker.png` 截图校验。

注意：左侧 `vy=.84` 是为网页自建物理层校准的**通道空间补偿**，不是已还原原生 VPX 的内部推进参数。原版的真实机械碰撞和 CCD 仍需后续迁移。


## 2026-10-12：三维高架坡道 / 球体弹道升级

这次在不移除已有挡板、地面墙体、落袋、球锁状态机的前提下，将 `vpx/collision-world.js` 改造成带 **Y 轴球心高度与垂直速度** 的三维求解器（仍是基于 VPX 的自研近似物理，**不是 VPX 原生仿真**）。

- **数据**：`vpx/height-field.js` 从 `physics.json` 的原始 `Ramp` 拖拽点建立按弧长连续插值的坡面高度。真实 JP v4.3 里 `Ramp004` 高度约 **0.027–0.032 m**，与其重叠的 `Ramp009` 高度约 **0.062–0.067 m**；`Ramp005`/`Ramp006` 是约 0.0027m 宽的侧边导轨，不作为另一个可行走的面。
- **飞行 / 着陆**：球体具有 `y/vy/onRamp/surfaceY`。飞行球受垂直重力影响；只有从上方下降并穿越坡面高度才会被坡道接住，底层球穿过上层桥梁**不会吸附到上层**；坡面运动受坡度重力和侧向轨道接触影响。走出前后开放端后保持离轨高度和切向竖直速度，再沿弹道落向较低坡面或桌面。
- **球体碰撞**：地面 Wall/Gate/Bumper/Flipper/Trigger 按相交高度过滤，避免高空球被地面透明投影弹飞；多球接触改用三维球心距离和三维冲量；移动挡板能够在强击球时给球一定竖直动量。球的旋转改为按移动距离计算，并在 Three.js 用真实 `ball.y` 位置渲染。
- **稳定性**：对于仍缺乏原版 VPX 可动机关动作、球被几何困住的死角，连续数次物理 Ball Search 无果后启用回球机构兜底（会有非物理位置恢复，需在完整机构迁移时替换）。
- **测试**：`tests/vpx-3d-ramps.mjs` 用纯合成两层坡道在公开 CI 验证下层穿桥、上层落地、坡道滚动、侧轨、离轨抛物线、立体墙与球体高度；本机还会用你的 JP v4.3 两层真实 Ramp 数据核对。Chrome `tests/vpx-play.cjs` 把球放在真实上层坡道上方落下，验证原始坡道接触和 Three.js 渲染 Y 一致，结果在 `tests/artifacts/vpx-elevated-ramp.png`。

尚待还原：VPX 原生倾斜台面重力校准、动态连续碰撞（CCD）、杆的真实 3D 旋转接触、坡道竖直侧壁/完整厚度、可动机械交互和完整 VBS 动画。现在是明显改进的三维近似物理，而不是可复现 VPX 每个弹跳细节的引擎。


## 2026-10-10：按本地 VPX/VBS 脚本迁移任务规则（阶段性）

对照本机 `assets/vpx-local/source-script.vbs` 的 `CheckMissionTargets`、`AcceptMission`、`CheckMission`、`AddProgress` 和对应部件 `*_Hit` 事件，新建 `vpx/original-rules.js`，把 9 个军衔的 5 档任务列表、17 种任务及其多阶段目标、接受分、奖励分、晋升进度按 JP's Space Cadet v4.3 写成表驱动规则。

- **Cadet 初级任务**：上方 `Target004` 选择 Launch Training（坡道 3 次、完成奖励 500,000 和 6 进度）；中间 `Target003` 选择 Re-entry Training（上方球道 3 次、500,000 和 6）；下方 `Target002` 选择 Target Practice（1–3 号攻击弹射器 8 次、500,000 和 6）；三个任务灯点亮后选择 Science Mission（14–22 号落靶 9 次、750,000 和 9）。接受任务各奖励 10,000，原来错用的统一 500,000 +6 规则已移除。
- **晋升**：原版 `AddProgress` 规定达到至少 **17** 点就晋升并重置进度，不是网页旧规则的 18；军衔任务分组是 0、1–2、3–4、5–6、7–8。
- **中高等级任务**：加入 Rescue/Alien Menace、黄红绿虫洞依次命中的 Secret、彗星和辐射目标组、黑洞、Cosmic Plague 的旗帜 75 次和 Space Warp、Satellite、Recon、Time Warp、八阶段 Maelstrom 等条件。这些条件在状态机中均可执行，但个别物理触发器尚不完整，**不能将状态机全通当成完整游玩验证**。
- **原版编号和计分**：`Target020–022` 是 Booster（并非旧版错误的 8–10）；8–10 是 Comet，11–13 是 Radiation。Skill Shot 由 `Trigger018–023` 选择奖金值，经过 `Trigger029` 才结算；`Trigger030` 是 Launch Ramp 尾端，`Trigger028` 是 Space Warp。Hyperspace 依照 10k/20k/20k/50k/150k 的五次奖分递增。初始反弹柱/卫星柱基础分也已按源脚本修正。
- **多球启动**：不再首次进入虫洞就无条件出现三球；按原版“匹配已激活虫洞颜色，累计三次锁球”条件启动。浏览器目前**只模拟球锁条件，不实现 VPX 真的 DestroyBall/LockBall/自动补球槽**；这一点与原生体验仍有差异。
- **网页 DMD/记分牌**：显示当前阶段说明、Skill Shot 灯值、锁球数、奖励；助玩按钮可直接接受任务，但原版物理入口需要先打亮目标再完成发射坡道。按钮是网页辅助功能，不是原版脚本自身的功能。
- **回归**：`npm.cmd run test:game` 现在包括 `tests/vpx-script-parity.mjs`（9 等级 × 4 选项 = 36 种选择、17 个不同任务的状态机路径）和 Chrome 真正打球、计分及原版碰撞落袋测试。

**范围说明**：此更新迁移的是“游戏规则和条件”，不是完整的 VPX 原生物理求解、活动挡板/单向门铰链、3D 高架坡道、球锁、所有视觉脚本/音频或逐帧位移；对于未完整接入的事件，不应宣称 1:1 效果。若目标是一次性得到 VPX 原版手感，直接运行用户已有的 .vpx 桌面桌台才具备原生物理与 VBScript；纯网页需逐一移植接触求解及脚本回调。

## 2026-10-10：原版街机风格完整游戏界面与计分柜

### 入口和模式分离

**直接开始游戏：** `http://127.0.0.1:8000/vpx.html`（或旧兼容入口 `?play=1`）。正常模式只有左侧可玩的 VPX 弹珠台和右侧专用 **Space Cadet 主题记分牌**，不再显示模型调试/材质/线框窗口。

**模型检查器：** `http://127.0.0.1:8000/vpx.html?inspect=1`。原有 camera、glTF 材质/照明、线框、零件聚焦、保存 GLB 和报告功能仍保留在独立入口，不影响普通玩家。

### 街机计分与任务 UI

- CSS 原创绘制的蓝色机柜与太空标识；黑色数码计分屏（8 位、玩家、球数、Ball Saver、额外球），橙色 DMD 消息屏用于 Skill Shot、Mission、晋升、Jackpot、多球和 Game Over。
- 实时军衔和晋升条、任务名称/完成进度、燃料、倍率、Bonus、Jackpot、COMBO、场上球数、目标组三联灯、发射蓄力条。
- 操作按钮：新游戏、暂停、轻推、音效、上一/下一任务、开始任务；键盘 **A/D 或 ←/→** 控制挡板，**Space** 蓄力发球，**Q/E** 轻推，**P** 暂停，**R** 重来，**Z/X** 选择任务，**M** 开始任务。选择/开始任务按钮是网页版为了便于体验而提供的快捷入口，物理坡道命中同样能触发任务，但并非原版 VBScript 的完整规则。
- Game Over 显示**本机前 5 名排行榜**并支持输入最多 8 个字的昵称；浏览器 `localStorage` 保存。历史纯数字榜单会自动兼容。
- 移动端保留三枚大触控按钮，桌台与记分柜采用纵向布局；常规桌面上记分柜固定靠右。
- 进游戏后隐藏 GLB 原本独立放在桌面左边的 3D 数字显示牌（`digit*/digitgrid`），以免与右侧新计分屏重复；检查器模式仍可查看源资产。

### 玩法联动补充

- 原本“发射力大于 83% 立即给 15,000 分”不符合 VPX 源码，已调整为**经过 Trigger018~023 选择上行 Skill Shot 金额，再由 Trigger029 兑现分数**（15,000/30,000/75,000/30,000/15,000/7,500）。
- 顶部 Trigger006~008 对应回航通道与武器灯；燃料 Trigger012~017 按 VPX 事件编号补充；斜坡连续命中触发 COMBO 消息和奖励。
- 已覆盖状态显示、三球、球保护、发球、落袋、任务状态、晋升、额外球、Jackpot、Bonus、Tilt、暂停、新游戏和本地排行榜。原版 VPX 的真实物理、灯光及任务脚本细节仍有未完成部分，**不宣称 1:1 原生 VPX**。

回归：`npm.cmd run test:game`，含真实 Chrome WebGL 的分数更新、任务选择/接受/进度、挡板、暂停、落袋、Game Over、排行榜登记和无调试栏断言。旧的视觉检查自动化应访问 `?inspect=1`。

## 2026-10-10：排水口修复（球不掉下去）

**已复现的根因**：原版的 `Drain` 洞口位于 VPX 坐标 x≈0.26637,z≈1.04805，但上一个纯二维求解器把球看成永远在球桌平面上滚动，只在它与原版 `Drain` kicker 的圆形碰撞区域重叠时才能判定落袋。在两支挡板的中心出口，`rpin009`、`Wall317` 及挡板边缘会先与弹珠反复接触，使球停在 x≈0.255,z≈0.9325，永远进不到 `Drain`。

修复位于 `vpx/collision-world.js`、`vpx/game-view.js`：

- 用原版 VPX 左右 Flipper 的原始转轴、长度、静止角度和弹珠半径求出球从**中间挡板缝隙**落下的单向穿越平面；仅允许球从上向下进入，仍可接住或弹回的球不误吞。
- 球一旦穿过，`falling` 事件立即锁定普通墙体/挡板碰撞，然后在 0.32 秒内向 `Drain` 中心移动、球的 Three.js Y 坐标逐渐下降并隐藏地面阴影；结束时调用 `onDrain`，正常触发 Ball Saver / 下一球 / Game Over。
- 物理 `Drain` kicker 圆形触发仍保留，适用于已经从出球通道到达该位置的球；中间出口提前识别并不是随意加一条矩形落球边界。
- 卡球搜索不会救回已经下沉的球；多球碰撞和普通墙体接触也会跳过下沉球。

回归：`node tests/vpx-physics.mjs` 已加入挡板缝隙落球、下沉帧、球数切换、防误判上行球以及**不按挡板和持续按挡板两场完整三球对局**；`node tests/vpx-play.cjs` 在真实 Chrome + Three.js 中核对了下沉视觉状态、下一球与退场。测试均已通过。

## 2026-10-10：原始桌台碰撞数据迁移

上一版发生“碰撞乱弹”的主要原因：用任意半径的圆代替真实 Wall/HitTarget 边线、只在桌面 x=0..0.512 的矩形内反弹、发射杆位置放错到 `PlungerTip` 后面，以及一律将 VPX Gate 当成硬墙。

已在本机 **JP's Space Cadet v4.3.vpx** 上迁移：

1. `vpx/physics-extract.js`：使用现有 Rust/WASM 解析器提供的 `/vpx/gameitems/*.json`，提取可碰撞 Wall/Ramp/HitTarget、Bumper 圆、Flipper 的真实角度/轴心/长度/半径、Gate、Trigger、Kicker 及弹性和物理高度，统一转换到 GLB 坐标（1 VPX unit = 0.00053975m）。
2. `scripts/export-vpx-physics.mjs`：把本机表的碰撞数据导出到被 Git 忽略的 `assets/vpx-local/space-cadet.physics.json`。本机完成提取，共 55 个 Wall、22 个目标、7 个弹射器、7 个 Gate、4 个 Ramp、2 个主挡板、30 个 Trigger 和 6 个有效 Kicker。近地面碰撞层被细分为 **504 条有效边线**，并建立网格空间索引。
3. `vpx/collision-world.js`：按物理层高过滤空中几何；用分步位置纠正、真实墙体最近点、撞击法线反射、目标边线和弹射器冲量完成球与固体的碰撞；添加球球碰撞、原版挡板角度行程和角速度推球、进出 Trigger 的独立检测。当前用纯 JS 求解器，并非 VPX 原生物理。
4. **发球与球道**：从原版 `swPlungerRest` 而不是尾部 `PlungerTip` 决定初始弹珠位置，解决穿过 `Wall348` 后被反弹回排水沟的问题；按 Gate 一向阀的特性处理——目前单向旋转 Gate 暂时不作为静态墙，避免创造错误的永闭死角。原桌台左右回弹器按 VBS 所写的 `KickerRest_Hit → 1500ms AutoFire` 补上计时推射，并加入卡球搜索。
5. **Kicker**：按原本 Wormhole、HyperSpaceHole、BlackHole 和 Drain 的位置触发，而不是按随意画出的矩形区域；额外球由 VPX 发球通道进入，不从桌面中心凭空生成。
6. **对齐调试**：在侧栏勾选“显示 VPX 碰撞线框”，青色为有效的墙体/目标边线，金色为弹射器半径。可以和原始 GLB 网格一起旋转观察。

只需运行：

```powershell
cd G:\AI\space-cadet-rust
npm.cmd run extract:physics
npm.cmd start
```

然后访问 **http://127.0.0.1:8000/vpx.html?play=1**。本机已经导出了物理 JSON，正常情况下无需重新执行提取；当更换 VPX 文件时，应重新提取。直接选择新的 VPX 文件时浏览器转换 Worker 也会同时提取相应碰撞几何；只选择独立 GLB 不含原始 VPX 物理信息时仍会回退为简化碰撞。

验证：

```powershell
npm.cmd run test:game
```

**仍然没有完整迁移**：VPX 的三维球高、Ramp 的可行走倾斜表面、落差、Wire Ramp、旋转 Gate 的铰链和单向接触、运动触点特殊逻辑、弹性散射和数值与 VPX 原版的严格一致性。当前将高架斜坡记录下来并从地面碰撞中排除，避免“空中坡道”成为隐形地面墙。JP v4.3 的全部 VBScript 任务细则也没有逐条移植。真正的 1:1 手感仍需要三维接触求解和原生 VPX 对照轨迹测试。

---

# 原有视觉和玩法说明

## 现在可以直接玩

在项目目录运行 `npm.cmd start`，然后访问：

**http://127.0.0.1:8000/vpx.html?play=1**

此入口加载 JP's Space Cadet v4.3 的本机 VPX→GLB 模型并自动开始游戏。原先的 **http://127.0.0.1:8000/vpx.html** 仍保留静态材质、灯光和模型检查模式，也可以点击侧栏的“开始游戏”。

- **操控**：A/D 或 ←/→ 挡板，按住 Space 充能后松开发射，Q/E 推台（推太多会 TILT），P 暂停，R 重新开局，手机屏幕按钮同样有效。
- **生命周期**：三球、发射杆/蓄力、12 秒首次 Ball Saver（每球限救一次）、排水沟/球洞、第三球结束、重新开局、额外球、浏览器本地最高分（前五条）。
- **事件与分数**：7 个物理弹射器、目标与三目标银行、弹簧护柱、弹弓、进球通道、燃料、倍率、勋章、奖励球、超空间 Jackpot、Bonus、反射射门。
- **任务与晋升**：Cadet 到 Fleet Admiral 的军衔进度；任务灯选中、发射坡道接受任务、事件积累/完成/失败、燃料耗尽；名称和主要奖励参考原版规则，部分命中条件仍是近似。
- **JP v4.3 变体**：虫洞会触发额外两球形成三球 multiball，与一些经典 Windows 版规则不同。
- **视觉联动**：VPX 导出的挡板网格跟随按键旋转、弹珠/阴影动态出现、弹射环反馈、发射杆回拉、实际 VPX 灯位随游戏状态更新；游戏音效使用轻量 WebAudio 合成声，原始游戏音频未重新分发。
- **保持安全**：VPX 中的 VBScript **不会执行**，只读取/转换用户本地桌台。转换后的 GLB 依然在已忽略的本地资产目录。

### 非常重要的范围说明

**本版是可玩试玩核心，不是完整的 VPX 运行时或者 1:1 的桌台玩法移植**。它使用 JavaScript 固定步长近似物理，不是 VPX 原生碰撞引擎；未逐条执行或移植 JP v4.3 中 190KB 的 VBS 游戏脚本。导出的 GLB 提供显示网格和部分组件元数据，**不包含完整可运行的原 VPX 物理约束、Kicker 状态、斜坡/升降轨道和多球碰撞规则**。因此斜坡、超空间、虫洞事件触发域、任务条件和部分灯光绑定为近似实现，不保证原版手感与得分完全相同。

真正完成 1:1 仍需要：解析 VPX 各类 Wall/Ramp/Kicker/Trigger 的真实碰撞数据、物理材料与转轴；构建物理和球球接触；逐项将 JP 的 VBS 任务/奖励/灯光/计分事件迁移成可执行的事件状态机，并在原生 VPX 对照日志中重放输入。若目标是立刻体验原版规则与手感，直接用 VPX 桌面程序打开你的原始 v4.3 VPX 文件更准确。

### 新增自动化测试

```powershell
node tests/vpx-gameplay.mjs
node tests/vpx-play.cjs
```

前者测试规则状态、进球、救球、球数、奖池、晋升与多球；后者真实打开 Chrome WebGL、加载 588 网格、发射弹珠、按 A 旋转原版挡板、P 暂停/恢复并截图。截图在 `tests/artifacts/vpx-play.png`（不需要分发）。

---

# VPX 视觉导入说明

目标：先证明 JP's Space Cadet 的实际三维模型和贴图能在 Three.js 中加载、近看和旋转，再决定如何迁移游戏核心。

## 数据路线

`VPX → vpin Rust/WASM extract → export_glb → GLTFLoader → Three.js`

浏览器转换在 `vpx/convert-worker.js` 中执行；Node 命令行和 Worker 共享 `vpx/conversion.js`，使用固定版本 `@francisdb/vpin-wasm 0.38.4`。Three.js 固定为 `0.180.0`。库文件从本机 node_modules 加载，npm 安装完成后预览不依赖 CDN。

## 当前本机数据

- 作者：JPSalas（完整署名及桌台说明保存在导出报告的 tableInfo 中）。
- 桌台内部版本：4.3；原文件 `JP's Space Cadet v4.3.vpx`。
- 下载来源：[Lutris 安装资源仓库](https://github.com/legluondunet/MyLittleLutrisScripts/tree/master/Visual%20Pinball%20X)。
- 上游作者页面：[JP's Space Cadet](https://www.vpforums.org/index.php?app=downloads&showfile=16091)。该页面的 6.0.1 下载没有成功取得，当前没有将旧版冒充新版。
- 本地原包：`assets/vpx-local/jps-space-cadet.7z`。
- 原 VPX：`assets/vpx-local/JP's Space Cadet/JP's Space Cadet v4.3.vpx`。
- 可独立导入 Blender 等工具的 GLB：`assets/vpx-local/space-cadet.glb`。
- 转换报告、原文件及 GLB 的 SHA-256：`assets/vpx-local/space-cadet.report.json`。

桌台、原包、转换资产均加入 Git 忽略，不随源码再分发。上游桌台不是随 vpin 的 MIT 许可一起授权；作者页面标明修改需批准，公开发布转换资产前应单独确认。

## 使用

```powershell
npm.cmd ci --ignore-scripts
npm.cmd start
```

打开 http://127.0.0.1:8000/vpx.html 。本机示例存在时自动载入，否则选择自己的 VPX 或内嵌贴图的 GLB。ZIP/7z 需先解压。

检查顺序：整桌轮廓 → 双击零件近看 → 白模检查几何 → 贴图原色检查素材分辨率 → 中性/侧光检查材质。选中零件后可单独显示。导出的原始相机可用于对照，但不能保证 VPX 编辑器的视图与 glTF 相机完全一致。

以 glTF 材质定义为基础，照明可切换街机暗场、摄影棚、中性光和侧光。导出灯光默认关闭，开启后最多显示 8 盏；VPX 光强与 glTF 灯光转换尚需校准。白模、原色、线框只影响预览；保存 GLB 得到的是原始转换结果，不包含这些检查模式。

网页加载时会修正材质的可见性设置：根据实际网格开放边检测薄片和未封闭曲面，启用双面渲染；将几乎全不透明的透明材质恢复为实体材质，将只有透明孔洞的贴图改用 alphaTest，保留真正半透明件。这些调整使用独立材质副本，GLB 文件保持原始转换结果。`tests/vpx-orbit.cjs` 检查旋转视角并对实际导流板进行正反面可见性回归。

指示灯现在可动态点亮：在“指示灯测试”中选择巡回、全亮、全灭或 VPX 保存状态。默认街机暗场配合发光光晕，可调节灯光亮度。灯的位置、名称和色彩来自 GLB 中的 VPX 数据；台面灯使用原台面图案作为发光贴图，保留彩色图案。GI 照明范围不作为实体发光圆片显示。巡回是视觉测试程序，不代表原版任务灯效已迁移。白模和贴图原色模式暂停显示发光，保存 GLB 仍保留原始转换资产。

`vpx/lamps.js` 提供按 VPX 灯名控制 `0/1/2`（灭/亮/闪烁）的接口，供后续任务事件驱动；目前尚未执行原桌台脚本。

### 命令行转换

```powershell
node scripts/convert-vpx.mjs "assets/vpx-local/JP's Space Cadet/JP's Space Cadet v4.3.vpx"
```

导出所有运行时可见的对象类型，不用编辑器隐藏状态过滤（发布桌台常隐藏编辑图层）。声音无需参与视觉转换；VBScript 仅作为文件数据读取，绝不执行。

### 验证

先保持本机 HTTP 服务运行，再执行：

```powershell
npm.cmd run test:vpx
```

转换检查验证实际 GLB 内嵌资源、网格和材质，以及损坏文件处理。浏览器检查需要 Windows Chrome（或设置 `CHROME_PATH`），使用独立临时用户目录，验证真实 WebGL 载入、白模、聚焦、隔离，以及实际 VPX 的 Worker 转换。截图写入 `tests/artifacts/`。这不构成与原生 VPX 的画面一致性验收，也不代表硬件加速机器的性能基准。

## 下一阶段

1. 在原生 VPX 中取得相同桌台和视角的参考帧，对照模型缺失、脚本初始化位置、透明材质、发光贴片和反射。
2. 确定素材质量和整体美术可接受后，再将 VPX 中的组件名称、变换和几何关联到独立的运行时状态。
3. 接入原版/移植后的物理与规则，驱动挡板、灯、球、DMD 等动态状态。GLB 是视觉资源，不包含游戏逻辑。

参考：[vpin](https://github.com/francisdb/vpin) · [WASM API](https://github.com/francisdb/vpin/blob/main/wasm-readme.md)
