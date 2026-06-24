# 虎宝 (Hupilot) — 你的全能 AI 宠物伙伴

虎宝是一款浏览器 AI 宠物插件，**核心功能完全免费**。

- **Edge 商店**: https://microsoftedge.microsoft.com/addons/detail/kgpeoblpookpclfcoicagocelngcaohe
- **隐私政策**: https://huidezh.github.io/hupilot-privacy/

## 核心功能

- **AI 对话 + 网页理解** — 在任意网页按 `Alt+Shift+Space` 呼出，AI 自动理解当前页面内容
- **本地文件读写 + 命令执行** — 安装本地主机后可执行 Shell/Python 命令、读写文档（.docx/.xlsx/.pptx），支持一键升级
- **上下文压缩** — 对话超过 6 轮时自动总结旧历史，保留最近 2 轮完整对话，避免长对话超出模型上下文
- **网页翻译** — 一键将整个网页翻译为目标语言
- **联网搜索** — 支持百度网页搜索（无需 API Key）、百度智能搜索、Tavily 搜索、AnySearch 搜索
- **PDF 阅读** — 自动提取 PDF 文字内容，可直接围绕 PDF 提问
- **语音朗读 (TTS)** — AI 回答支持语音朗读，自动选择中文音色
- **Outlook 邮件助手** — 在 Outlook Web 中一键优化邮件措辞、修正语法、调整语气
- **字幕助手** — Bilibili 视频和 YouTube 自动获取，可总结视频、下载字幕
- **HTML 编辑器** — 直接在页面中修改任意元素的样式、文本和结构
- **桌宠模式** — 最小化后变成悬浮宠物，随时陪伴
- **对话导出** — 一键导出为 Markdown 文件
- **多会话管理** — 对话历史保存在本地，随时切换
- **深色模式** — 跟随系统或手动切换
- **自定义系统提示词** — 按需调整 AI 的回复风格
- **快速操作按钮** — 自定义常用提示词，一键触发
- **Markdown 渲染** — 支持代码高亮、表格、数学公式等

## 免费模型

内置多家免费 AI 模型供应商：

- **SenseNova**（商汤）— 免费，提供 sensenova-6.7-flash-lite、deepseek-v4-flash 等模型
- **KiloCode** — 提供 `kilo-auto/free`、`openrouter/free` 等免费模型
- **Agnes** — 免费，提供 agnes-2.0-flash 等模型
- **DeepSeek**、**Mimo** 等供应商

## 快速开始

1. 从 Edge 商店安装插件
2. 点击工具栏图标或按 `Alt+Shift+Space` 打开侧边栏
3. 在设置中选择 AI 模型供应商并获取 API Key
4. 开始对话！

## 构建

```bash
# 构建发布包
build\build-submit.ps1
```

## 技术架构

- **Manifest V3** — Chrome/Edge 扩展规范
- **侧边栏注入** — content script 向页面注入 AI 对话侧边栏
- **MAIN world 注入** — 通过 `chrome.scripting.executeScript` 注入 TTS、翻译等需要页面上下文的脚本
- **联网搜索** — 支持工具调用（function calling）模式，AI 自主决定何时搜索
- **Native Messaging** — 通过 `chrome.runtime.connectNative` 与本地主机通信，执行 Shell/Python 命令
- **Shadow DOM 深克隆** — 提取页面内容时递归深克隆 DOM，保留 Shadow DOM（open）内容
- **Defuddle** — 点击图标时注入，提取页面正文作为 AI 上下文
- **Turndown** — "另存为 MD" 时注入，将 HTML 转为 Markdown
- **上下文压缩** — 对话超过 6 轮时自动用 LLM 总结旧历史，保留最近 2 轮完整对话

## 许可

[Apache 2.0](LICENSE)

Copyright 2026 HWB
