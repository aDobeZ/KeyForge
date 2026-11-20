# KeyForge

[English](./README.md) | 简体中文

基于 **LessPass v2 算法** 的增强型无状态确定性密码生成器：支持本地平台档案记忆、自定义特殊字符集、重随机次数追踪以及 `AES-256-CTR` 加密备份同步。

> 灵感源自 [LessPass](https://github.com/lesspass/lesspass)。KeyForge 保留了无服务器、不保存主密码的安全架构，并针对个人多端日常使用场景增加了丰富的可用性增强。

---

## 核心特性

- **100% 兼容 LessPass v2 算法**
  - 使用 `PBKDF2-HMAC-SHA256`（100,000 次迭代）+ 基于 `BigInt` 的确定性字符提取。
  - 在默认全选特殊符号时，生成的密码与官方 LessPass v2 完全一致。
- **按平台自由选择特殊符号**
  - 创建平台配置时，可自由勾选/取消单个特殊符号（例如应对只允许 `!@#$` 的老旧网站）。
- **本地平台档案记忆与输入联想**
  - 仅在本地（`localStorage` / `chrome.storage.local`）保存平台域名、用户名、当前是第几次重随机（Counter）、密码长度和自定义特殊字符集。
  - **绝不保存**你的主密码或生成的密码。
  - 在 `Site` 输入框聚焦或输入时自动弹出联想下拉菜单；在浏览器插件中打开时自动识别当前网页域名。
- **一键重随机（`+1`）**
  - 记录每个平台密码的轮换次数，点击「🎲 重随机+1」即可自动递增次数、算出新密码并同步更新本地记录。
- **主密码视觉指纹**
  - 输入主密码时实时显示 3 个彩色几何图标，在生成密码前即可肉眼核对主密码是否误输。
- **加密备份与“乱码预览”导入（`AES-256-CTR`）**
  - 支持导出 `.mlp` 加密文件或可复制的加密 Base64 文本（方便手机与电脑间传输）。
  - 导入时输入主密码会**直接展示解密后的文本预览**：密码正确显示清晰的平台 JSON，支持“合并（保留较新）”或“覆盖”；主密码错误则直接呈现出乱码字符，一眼即可判断密码不匹配。

---

## 部署与安装指南

### 1. 浏览器插件版（Chrome / Edge，Manifest V3）

仓库中默认只托管源码，因此首次安装需要先在本地构建出 `dist/extension` 目录：

```bash
git clone https://github.com/aDobeZ/KeyForge.git
cd KeyForge
npm install
npm run build
```

构建完成后加载到浏览器：
1. 在 Chrome 地址栏打开 `chrome://extensions/`（或 Edge 中打开 `edge://extensions/`）。
2. 开启右上角的 **「开发者模式」**。
3. 点击 **「加载已解压的扩展程序」**，选择本项目的 `dist/extension` 文件夹。
4. 在浏览器右上角扩展图标列表中点击图钉将 **KeyForge** 固定到工具栏，点击即可自动识别当前网页域名并匹配已保存记录。

### 2. 移动端离线 PWA 版（Android）

本仓库已内置 GitHub Actions 工作流（`.github/workflows/deploy.yml`），每次推送代码到 `main` 分支都会自动构建并部署 `dist/pwa/` 到 GitHub Pages：
1. 在 GitHub 仓库的 **Settings -> Pages -> Build and deployment -> Source** 中选择 **GitHub Actions**。
2. 用手机浏览器（Chrome / Edge）打开部署好的网址，点击菜单中的 **「添加到主屏幕」**，即可作为独立应用 **100% 离线运行**。

### 3. 电脑单文件离线版

执行 `npm run build` 后，可直接双击打开 `dist/mylesspass-standalone.html`，无需安装任何环境即可在任意电脑浏览器中使用。

---

## 本地开发与测试

```bash
npm install
npm test      # 运行 Vitest 单元测试（LessPass v2 测试向量 & AES-CTR 加密同步）
npm run build # 同时构建 PWA、浏览器插件与单文件 HTML
```

---

## 安全说明

所有密码派生与加密运算（`PBKDF2`、`HMAC-SHA256`、`AES-256-CTR`）均完全在本地浏览器内通过 **Web Crypto API** 执行，零后端服务器，不发起任何网络请求。
