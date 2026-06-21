# 虎宝 (Hupilot) — 你的全能 AI 聊天助手

虎宝是一款浏览器 AI 聊天插件，**所有功能完全免费**，没有隐藏收费，没有使用次数限制。

- **Edge 商店**: https://microsoftedge.microsoft.com/addons/detail/kgpeoblpookpclfcoicagocelngcaohe
- **隐私政策**: https://huidezh.github.io/hupilot-privacy/

## 核心功能

- **AI 对话 + 网页理解** — 在任意网页按 `Alt+Shift+Space` 呼出，AI 自动理解当前页面内容
- **网页翻译** — 一键将整个网页翻译为目标语言
- **联网搜索** — 支持百度网页搜索（无需 API Key）、百度智能搜索、Tavily 搜索
- **PDF 阅读** — 自动提取 PDF 文字内容，可直接围绕 PDF 提问
- **语音朗读 (TTS)** — AI 回答支持语音朗读，自动选择中文音色
- **Outlook 邮件助手** — 在 Outlook Web 中一键优化邮件措辞、修正语法、调整语气
- **桌宠模式** — 最小化后变成悬浮小图标，让 AI 助手随时陪伴
- **对话导出** — 一键导出为 Markdown 文件
- **多会话管理** — 对话历史保存在本地，随时切换
- **深色模式** — 跟随系统或手动切换
- **自定义系统提示词** — 按需调整 AI 的回复风格
- **B 站字幕助手** — Bilibili 视频页面自动获取并翻译字幕

## 免费模型

内置多家免费 AI 模型供应商，一键获取 API Key：

- **SenseNova**（商汤）— 免费，提供 sensenova-6.7-flash-lite 等模型
- **KiloCode** — 提供 `kilo-auto/free`、`openrouter/free` 等免费模型
- **Agnes** — 免费，提供 agnes-2.0-flash 等模型
- **DeepSeek**、**OpenRouter**、**Groq** 等供应商

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

- **Manifest V3** — Chrome 扩展规范
- **侧边栏注入** — content script 向页面注入 AI 对话侧边栏
- **MAIN world 注入** — 通过 `chrome.scripting.executeScript` 注入 TTS、翻译等需要页面上下文的脚本
- **联网搜索** — 支持工具调用（function calling）模式，AI 自主决定何时搜索

## 许可

[Apache 2.0](LICENSE)

Copyright 2026 HWB
