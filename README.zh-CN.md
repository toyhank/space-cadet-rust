# 网页版太空军校生弹珠台

English: [README.md](README.md) · 简体中文

一个基于浏览器与 Three.js 的弹珠台项目，探索 VPX 桌台转换和物理适配。公开试玩版需要玩家自行导入有权使用的 VPX 文件；桌台文件保留在浏览器本地，本仓库不附带桌台资源。

**[打开公开试玩](https://toyhank.github.io/space-cadet-rust/?vpxccd=1)** · [实现范围](VPX-WEB.md) · [文档导航](docs/README.md) · [架构](docs/architecture.md) · [测试](docs/testing.md) · [许可说明](docs/licensing.md)

## 项目功能

- 在浏览器内通过 @francisdb/vpin-wasm 转换 VPX 桌台，转换在本地执行，应用不会把文件上传到服务器。
- 使用 Three.js 展示桌台；游戏状态、规则和大部分物理逻辑由 JavaScript 驱动。
- 提供部分 C++/WASM 墙体和挡板碰撞实验，以及 JavaScript 碰撞时间调度与坡道扫掠检测。

这是一个独立的网页实现，包含从 VPX 适配的代码；它**不是完整 VPX 引擎，也不保证逐帧或 1:1 一致**。当前实现范围、近似部分和验证方式见 [VPX-WEB.md](VPX-WEB.md)。

## 在线试玩

打开[公开试玩版](https://toyhank.github.io/space-cadet-rust/?vpxccd=1)，选择自己有权使用的 VPX 文件或由其转换得到的 GLB，并按页面提示操作。游戏界面显示键盘操作（方向键、空格、Q/E）。建议使用带键盘的桌面浏览器；当前自动化检查未覆盖手机触控试玩。公开网站不包含 VPX 桌台文件。浏览器需要支持 WebAssembly 和 WebGL。

## 本地运行

需要 Node.js 22 或更新版本、npm；本地预览构建结果需要 Python 3。

```sh
npm ci
npm run build
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

然后访问 http://127.0.0.1:8000/。Windows 可使用 py -m http.server 8000 --bind 127.0.0.1 --directory dist。

npm run build 生成可公开部署的网页。npm run build:local 可能带入本机提取的桌台资源，只能用于私有本地构建；发布规则见 [部署说明](docs/deployment.md) 和 [DEPLOY.md](DEPLOY.md)。

## 测试

| 命令 | 用途 | 依赖 |
| --- | --- | --- |
| npm run test:ci | CI 使用的确定性物理和游戏回归检查 | Node.js；不需要私人桌台文件 |
| npm run test:game | 更完整的游戏、物理和浏览器场景 | 部分检查需要本地 VPX 资源和 Chrome |
| npm run test:vpx | VPX 转换、材质、灯光及浏览器集成 | 有权使用的本地 VPX 文件和浏览器测试环境 |
| npm run build | 构建公开试玩版 | Node.js 与 npm |
| cargo test | 修改 Rust crate 时运行 Rust 测试 | Rust 工具链 |

干净克隆默认没有私人桌台文件，因此依赖这些资源的检查需要自行准备。命令边界、浏览器测试前提和 Rust 检查说明见[测试指南](docs/testing.md)。

## 目录

- src/：网页应用与游戏逻辑
- vpx/：VPX 转换和物理集成，含原生代码许可声明
- tests/：回归测试与浏览器测试
- scripts/：构建及转换脚本
- .github/workflows/：GitHub Actions 与 Pages 部署
- docs/：架构、测试、许可和历史说明

转换器使用 Rust/WASM；游戏逻辑和部分实验物理在 JavaScript 中；指定碰撞算法由 C++ 编译为 WebAssembly。数据流与物理边界见[架构说明](docs/architecture.md)。

## 隐私与桌台资源

VPX 文件转换在浏览器本地完成。仓库和公开构建有意排除个人桌台文件与提取模型。请只导入自己有权使用的文件。没有明确再分发授权时，不要将桌台文件、提取资源或本地资源构建提交、上传到公开制品或发布到 Pages。

## 许可证与归属

本仓库包含不同许可的组件。根目录 [LICENSE](LICENSE) 适用于标明为 MIT 的项目部分；从 VPX 衍生的代码在 [原生代码声明](vpx/native/NOTICE.md) 中按 GPL-3.0-or-later 单独说明。复用代码或资源前请阅读[许可与第三方素材说明](docs/licensing.md)。第三方桌台图片、声音和 VPX 文件不会因本项目代码许可而自动获得再分发许可。

## 参与贡献

欢迎提交 issue 和 pull request。请让功能描述与可复现测试对应，说明所需本地资源，并避免提交未获授权的 VPX 文件或提取素材。请先阅读[贡献指南](CONTRIBUTING.md)，再运行与改动相关的检查。

## 后续方向

围绕持续接触求解、桌台几何、材质和事件时序逐步提高兼容性。当前仍存在的差距见 [VPX-WEB.md](VPX-WEB.md)。

---

本项目是独立的兼容性与学习实践，与 Microsoft 或 Visual Pinball 项目没有隶属关系。
