# Space Cadet · VPX → Rust/WASM → GLB → Three.js

## VPX C++ → WASM 原生碰撞移植试验

已从 [官方 Visual Pinball X](https://github.com/vpinball/vpinball) (GPLv3+) 提取并独立适配 **线段连续碰撞时间检测、球撞墙摩擦/自旋**，以及 **挡板线圈转矩、形状惯量、复位回弹和球拍碰撞反冲**，编译为 3.2 KB WASM。另外新增 4.2 KB 的挡板侧面/尖端扫掠 CCD 模块，检测高速球与旋转球拍的首次接触。网页右侧有“VPX C++ WASM 碰撞”试验开关，或在网址加 `?vpxccd=1`。关闭即可恢复旧版 JS。

**第四阶段新增：** 参考官方 VPX 最早命中时间的全局碰撞调度器、三维球球扫掠、按原始 Ramp 拖拽点生成的坡道三角面、球体抛物线碰撞时刻及侧边护栏 CCD。详见 [VPX-WEB.md](VPX-WEB.md)。

**重要：** 普通静态墙、挡板电机/冲量及锥形侧面/尖端接触检测使用 C++ WASM；最早时间队列与坡道三角面的接触数学在 JS 中适配自 VPX，按 GPL-3.0-or-later 标记。完整原版接触调度、全部坡道几何、圆形动态机关、随机散射与 VBS 引擎尚未移植，仍**不能称为完整 VPX 原生物理**。 完整技术范围与上游 GPL 授权、源码和编译步骤见 [vpx/native/NOTICE.md](vpx/native/NOTICE.md) 与 [VPX-WEB.md](VPX-WEB.md)。编译产物也提供相应源代码及 GPL 文本；原有 MIT 组件保留原协议。

## 可玩网页 / Web edition

**本机游玩：** http://127.0.0.1:8000/vpx.html

**已构建的独立网页：** http://127.0.0.1:8000/dist/ （先运行 `npm run build:local`，会使用你本地的 JP v4.3 VPX 衍生模型）。

这是一个使用 **Three.js + 自建 VPX 几何碰撞内核 + VPX 事件状态机** 的网页项目；**VPX 文件转换器** `@francisdb/vpin-wasm` 使用已经编译的 Rust/WASM，游戏的碰撞/任务逻辑本身目前仍是 JavaScript。

现在已经具备挡板、发球、目标、球数/落袋、DMD 记分牌、17 种基于 JP v4.3 原脚本整理的任务、单向 Gate、虫洞锁球及多球、军衔/奖池/奖励球与排行榜，以及 **20 多种原创 Web Audio 合成音效**（机械挡板、弹射器、金属球门、锁球、多球、任务旋律等），可调音量、静音并记忆设置。首次按键/点击后浏览器才会解锁音频，不会自动播放。当前物理已经加入 **Y 轴球体高度、竖直抛物线、VPX 双层真实坡面、侧边轨道、真实离轨与落地**，3D 游戏场景直接按球心高度绘制弹珠。已针对原版左侧 Kicker 出球上不去、Slingshot 仅有音效无物理弹射、静止挡板反复加速等问题做专项修正；左右 Kicker 和 Slingshot 的物理回归、真实 Chrome 左侧上层坡道测试均已通过。原始 VPX 的全部可动机械、原生多接触约束与完全一致的摩擦参数仍在开发；不应宣传为原版原生物理。

```powershell
npm ci --ignore-scripts
npm run test:ci
npm run build          # 可部署公共网页，玩家自行导入合法拥有的 VPX
npm run build:local    # 本机带已提取的模型，可直接开玩；严禁公开这个 dist
npm start
```

GitHub 仓库：**https://github.com/toyhank/space-cadet-rust**。GitHub Pages 自动构建位于 `.github/workflows/pages.yml`，发布细节和版权隔离见 [DEPLOY.md](DEPLOY.md)。完整规则与碰撞说明见 [VPX-WEB.md](VPX-WEB.md)。

---

## VPX 资产和建模技术说明

- 已使用 `@francisdb/vpin-wasm 0.38.4` 实际转换 JP's Space Cadet **v4.3**，并保留在本机 `assets/vpx-local/`。这不是 6.0.1；原站下载未成功，v4.3 来自公开 Lutris 安装资源。
- 导出的 GLB 包含 588 个网格、490 个材质定义、29 张内嵌图像、3 个相机、10 个灯光定义，约 9.5 MB。网页计数按实际实例化、被使用的网格和材质统计。
- 新页可旋转、缩放、检查白模和贴图原色、按名称查找及聚焦零件、单独查看、切换灯光、保存截图及 GLB。指示灯支持全亮、全灭和巡回点亮测试，并带可关闭的发光光晕。可直接打开或拖入 VPX，在 Web Worker 中完成 Rust/WASM 转换，文件不上传。
- VPX 原始游戏脚本不会被执行；网页事件与任务以独立状态机模拟。已迁移计分/任务/挡板、部分动态装置与分层坡面接触和弹道，但原版全套连续三维碰撞、机械动作及全部脚本灯光逻辑仍未完成。glTF 转换也不保证与 VPX 原生特殊材质完全一致。
- 原有 `3d.html` / `table3d/` 是早期 DAT + 简化 JS 物理原型。下方保留的历史记录中“完整复刻”“像素级精准”等措辞未通过当前实现的验收，不应当作新版本完成状态。

运行：

```powershell
npm.cmd ci --ignore-scripts
npm.cmd start
```

转换另一张桌台（不需要本机安装 Rust 编译器）：

```powershell
node scripts/convert-vpx.mjs "C:\path\table.vpx" assets/vpx-local/space-cadet.glb
```

详细路线、来源和验证方式见 [VPX-WEB.md](VPX-WEB.md)。发布操作见 [DEPLOY.md](DEPLOY.md)。

---

# 历史实现记录：DAT 三维原型

## 真正 3D 界面实现与原版效果一致（2026-10-10 更新）

- **统一世界坐标系**：摒弃过去由 2D 像素反推的粗略定位，直接基于原版 `PINBALL.DAT` 的物理碰撞几何世界坐标（[-8, 8] × [-14, 15] × [0, 1.5]）。
- **数学解析对齐相机（Authentic View）**：
  - 通过原版 `camera_info` 的 12 元变换矩阵与 700 号屏幕中心点，精确推导出原版倾斜角 $\theta = 24.0^\circ$、相机 3D 坐标 $(0, 21.0, 13.5)$ 以及透视参数。
  - 在 Authentic 视角下，3D 挡板、弹射器、护栏与台面位图达到像素级精准吻合；切换为 Orbit 视角时，支持 360 度自由旋转视察真实 3D 几何，不再有画面二次倾斜或拉丝问题。
- **3D 坡道与物理碰撞**：
  - 读取 DAT 中 18 个坡道倾斜平面方程（$z = ax + by + c$），建立真实具有坡度曲面与护栏的 3D 轨道。
  - 挡板严格按原版 800/801/802 参数计算基座与转角，支持 A/D 键控制挥动；空格键蓄力弹射。
- **本地直接访问**：
  - 浏览器打开：`http://127.0.0.1:8000/3d.html` 即可畅玩体验。
  - 支持原版固定视角与 360° 旋转视角实时切换。

## 原版组件坐标修正（2026-10-10）

**修复之前**：将首帧精灵的矩形中心当成物理中心；顶部 3D 圆形组件尺寸偏大，挡板转轴用手工 `b.x+6` / `b.y+b.h*.62`，角度用固定的 ±.23/±.78 估计，发射杆中心写死 (333,409)。这会出现弹射器/挡板与原版贴图重影、歪斜。

**本次修复**：`renderer3d/dat-geometry.js` 解析原版 `camera_info` 投影矩阵和桌面 700 号画面中心参数，导出世界坐标→原始画面坐标投影；另外提取每个组件的 600 号碰撞圆、以及挡板 800/801/802 号基座/静止末端/击打末端。具体：

- **7 个弹射器**：用原版 600 碰撞圆心、投影矩阵和初始 sprite 参考中心，自动反推 visual elevation；对你现有 PINBALL.DAT 的 7 个模型位置误差分别为 0.377、0.462、1.229、1.065、0.417、0.826、0.306 像素，模型缩小到原版贴图可见区域内，避免一圈额外过大的 chrome 环遮住画面。
- **左右挡板**：不再手工设定位置、长度、角度。左挡板投影基座 (132.64,384.27)，idle 末端 (163.11,407.73)，active 末端 (163.96,362.04)，右挡板按照 DAT 的真实坐标独立计算，转角约 1.27rad。
- **发射杆**：中心由 sprite 信息确定 (329.5,402)，高度缩为原版 42 像素范围，不再用 79px 的自制长杆。
- **目标组件**：严格限定弹起式目标 type 1006，取消把 1017/1019 也渲染成巨大立方体的错误。
- 验证：`node tests/component-alignment.cjs`；截图通过 Chrome 真实 WebGL 场景重新渲染。以上为**静态视觉位置校准**，不代表物理引擎已经精确移植。其他轨道/灯光还需逐个校正。

本地打开：**http://127.0.0.1:8000/3d.html?rev=componentmap5**（刷新避免浏览器缓存）。

## 透视校准修复（截图问题）

- 问题：原版 `PINBALL.DAT` 桌面位图已经绘制了透视梯形（顶部桌面有效范围约 x=72..293，底部 y≈424 为 x=2..363），原代码却将它铺到 3D 矩形盒上，并用斜向正交相机再次观察，导致原版桌面与模型外框轮廓不一致。
- 解决：新增 `renderer3d/table-perspective.js`，从原始数据逐行测量实际桌面边缘。忠实模式用测量结果生成梯形支撑底盘和护边，取消旧矩形机箱。
- 忠实模式初始相机为正交垂直俯视 `(0,36,0)`，允许缩放与平移，但**禁止绕场景旋转**，避免已有透视的位图被二次投影。真正能随意旋转的版本仍需把整个台面和轨道重新建立成独立 3D 网格（点击“切换原版参考 / 纯建模”能试验该路线）。
- 检查方法：`node tests/perspective-geometry.cjs`（原版梯形边界断言）、`node tests/faithful-art.cjs`（像素解码与参考 2D 引擎一致）；浏览器实际渲染截图已检查轮廓。
- **说明**：这是原版固定视图的精确几何/像素对齐，不是透视照片反求三维的完全重建。显示的立体组件仍有视觉近似，真实高保真 3D 需要继续从原版数据重建空间坐标与坡道高度。

## 原版优先 3D 校准模式（2026-10-10）

之前的纯建模版本不够忠实：灯光偏亮、轨道随意设计、桌面太空、相机倾斜，不能称作复刻。本次已调整如下：

- **3D 页面默认启用忠实模式**：从本机 `pinball.dat` 解码 365×470 的原版桌面与 203×394 的计分背景（没有将图片加入仓库）；图片经过 Scale3x 边缘插值，作为颜色和构图校准层铺到 Three.js 桌面几何上。
- 将原版 DAT 文件中的挡板、七个弹射器等组件定位在参考画面上，保留三维模型、灯光、材质、弹珠运动。
- 将相机改为接近原版的正交俯视，隐藏不准确的自造坡道和装饰，收起右侧设置栏，减少虚构的白色护栏。
- 点击右上角“显示设置”，再点击“切换原版参考 / 纯建模”，可以切回之前的完全程序化版本进行对照。纯建模直接使用 `?mode=prototype`。
- 新增 `renderer3d/original-art.js`，和 `tests/faithful-art.cjs`；后者逐像素确认原版桌面/背景的解码结果和旧版解析器一致。

**准确定位**：这是 **带原版低清视觉参考层的混合 3D 原型（2.5D/3D）**，并非所有对象已重建的“真正高清 1:1 3D”。近距离放大旧贴图依然有限；做到全程清晰且忠实，仍需基于 DAT 对每个 rail、ramp、decor、target 的形状和深度进行逐项建模，配合原始物理引擎验证。模型和物理进度勿夸大。

运行：
    node tests/faithful-art.cjs

## 新版 3D 展示与试玩（2026-10-10）

直接启动本机服务后访问 **http://127.0.0.1:8000/3d.html**：

    cd G:\\AI\\space-cadet-rust
    py -m http.server 8000 --bind 127.0.0.1

本次新增独立的 `3d.html` 与 `renderer3d/`：

- **Three.js 0.180** + OrbitControls / PBR 金属材质 / 环境反射与软阴影，完全程序化重建桌面、护栏、灯光、挡板、原生 3D 球与立体记分屏，不使用低清原版贴图放大作为画面。
- `renderer3d/dat-geometry.js` 读取本地 `pinball.dat` 的元数据，映射真实桌面坐标。已核对 541 组、340 个 table_objects 条目、7 个撞击器、左右挡板等位置；斜坡曲线、高度、碰撞物理仍属于简化重建。
- `renderer3d/world.js` 提供渲染层，`renderer3d/main.js` 提供演示用的**简化 JS 弹珠物理**和输入，不代表 Rust/WASM 物理已完成。
- 操作：**A/D** 或左右方向键控制挡板；按住 **空格**蓄力，松开发射；**R** 重新开局；鼠标拖动旋转、滚轮缩放；也可以切换顶视角 / 全屏 / 画质。
- Three.js 通过 jsDelivr CDN 加载，浏览器首次打开需要联网（本地 DAT 不上传）。建议在本机通过 `127.0.0.1` 打开，避免公开原版资源。
- 原有 `index.html` 是 2D 原版视觉对照入口，仍可继续访问。3D 版本是**第一版可交互原型，不是 1:1 原版物理/任务还原**。

验证：

    node --check renderer3d/dat-geometry.js
    node --check renderer3d/world.js
    node --check renderer3d/main.js
    node tests/3d-scene.cjs

后续应优先移植 Rust 中的 DAT 碰撞多边形、原版 TFlipper/TBall/TEdgeSegment 求解，逐项和原版对照；再补原版斜坡几何细节和灯光任务状态。

---

# 原版 2D 资源显示工程

直接读取你自己的 Windows **PINBALL.DAT**（或 Full Tilt CADET.DAT）显示原版桌面素材，取代此前手绘近似桌面。

**当前进度**：原版画面拼装、静态深度遮挡、挡板 8 帧原始素材/输入动画已完成首版；已新增全屏/宽屏显示和 2×、4× 边缘感知高清放大。**原版弹珠物理、发射器、规则、音效尚未移植，所以目前是资源/输入预览器，还不能说是完整的 1:1 游戏**。

## 运行（已检出本地 PINBALL.DAT）

PowerShell：

    cd G:\AI\space-cadet-rust
    py -m http.server 8000 --bind 127.0.0.1

在本机访问 http://127.0.0.1:8000/ 。页面启动时会读取同目录下的 PINBALL.DAT 并渲染原版资源，无需再选择文件。A / D 或左右方向键可查看两侧挡板真实 8 帧动画。浏览器最上方的“原版手感对照”会通过互联网打开 C++/WASM 参考实现（该视图不是 Rust）。

### 高清显示（可直接使用）

- 默认 **2×（1200×960）** Scale2x/EPX 边缘感知像素放大；选 **4×（2400×1920）** 可在 2K / 4K 显示器输出更多显示像素。
- 还可以切换浏览器平滑插值、原版清晰像素模式，并导出对应尺寸 PNG。
- 点击 **宽屏大窗口** 隐藏右侧设置栏；点击 **全屏** 或按键 **F** 进入真全屏，按 **Esc** 退出。
- 大窗口始终保持游戏原版 600:480（5:4）比例，不拉伸。源文件没有增加额外真实贴图细节；真正 1:1 高清重制仍需要更高分辨率的重绘美术或新 3D 资源。

为避免意外共享微软游戏素材，示例使用 127.0.0.1 绑定的本地 HTTP 服务。PINBALL.DAT 已通过 .gitignore 忽略，不应提交或分发。也可以在页面手工选取其他合法来源 DAT，或者载入项目内的 CC0 替代资源。

## 当前已完成的引擎资源流程

- PINBALL.DAT 的 541 个资源组、318 张位图读取与还原（实测用户本地原版数据）。
- 依据原版逆向工程的 table_objects（标签 1025）实例化组件列表。
- 根据桌面原始偏移 (137,2) 绘制组件；桌面位图直接放在 (0,0)，右侧背景显示于 (386,12)。
- 从正常 Bitmap16bit 和 spliced Sprite 数据提取深度，对 600×480 RGB 画布进行 Z buffer 合成。
- 按原版 DAT 帧状态与配置时间，支持左/右挡板的视觉动画。
- Rust（src/lib.rs）提供可构建成 WebAssembly 的二进制数据读取和 WASM 接口；当前机器没有可调用的 Rust 编译器，网页暂用 JS DAT 读取回退；Canvas 场景组装目前在 JS 中进行。

## 自动验证

    node --check viewer.js
    node --check dat-layout.js
    node --check dat-scene.js
    node tests/dat-smoke.cjs
    node tests/original-scene.cjs
    node tests/hd-display.cjs

后一项需要放在项目根目录的原版 PINBALL.DAT，验证左右挡板 8 帧、组件清单、原版比例、Z 合成与动作往返。另有 tests/render-scene-png.cjs 可以将渲染画面以 PNG Base64 输出，用来查看视觉回归。

## Rust → WASM（装好 Rust 后）

    rustup target add wasm32-unknown-unknown
    cargo test
    cargo build --release --target wasm32-unknown-unknown
    New-Item -ItemType Directory -Force pkg | Out-Null
    Copy-Item target/wasm32-unknown-unknown/release/space_cadet_rust.wasm pkg/space_cadet_rust.wasm

使用上述本地服务器刷新，资源读取器会采用 Rust/WASM 核心。注意：网页实时组件合成与动画目前仍由 JS 驱动，不可将其称为 Rust 物理游戏引擎。

## 距离画面与手感真正 1:1 还需

1. 对齐原版所有可见组件初始状态、弹珠 Z 遮挡、灯光闪烁、计分 UI 与每个显示帧（已完成初始静态状态/部分深度）。
2. 将原版 TBall / TFlipper / TEdgeSegment / TPlunger / TRamp 物理与碰撞几何迁移到 Rust，按原始 DAT 参数求解。
3. 重建 control.cpp 任务/奖励、得分、灯效、发射器、单球/多球机制、音频触发。
4. 使用同一批录制输入，逐帧比对 C++/WASM 逆向工程参考引擎和 Rust 的轨迹、事件、得分。

## 开源代码 / 资源许可

- 原版规则/数据结构参考：https://github.com/k4zmu2a/SpaceCadetPinball （MIT 实现代码）。
- 备用公开领域数据：https://github.com/andrewnakas/open-cadet （CC0，详见 assets/CC0-LICENSE.txt）。
- 原版可玩 C++/WASM 对照：https://lrusso.github.io/3DPinballSpaceCadet/3DPinballSpaceCadet.htm

**不要在 GitHub 上提交原版 PINBALL.DAT 或未经许可的原始图像/声音。** 原版资源的版权和逆向工程代码的 MIT 许可是两回事。
