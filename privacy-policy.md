# Privacy Policy for Hupilot / Hupilot 隐私政策

**Last updated / 最后更新:** May 2026

---

## Data Collection / 数据收集

Hupilot operates entirely locally and collects **no personal data** on our servers.
Hupilot 完全在本地运行，**不收集任何个人数据**到我们的服务器。

### What data is stored locally / 本地存储的数据

- **AI settings** (API endpoint, model, API key, system prompt, preferences) — stored in `chrome.storage.local` on your device only
- **Chat sessions and messages** — stored in `chrome.storage.local` on your device only
- **AI 设置**（API 地址、模型、API Key、系统提示词、偏好设置）— 仅存储在您设备的 `chrome.storage.local` 中
- **聊天会话和消息** — 仅存储在您设备的 `chrome.storage.local` 中

### What data is transmitted / 传输的数据

- When you send a message in chat, the message content and relevant page context (if you choose to include it) are sent **directly from your browser** to the AI API provider you have configured (e.g., DeepSeek, SenseNova, or a custom endpoint). We do not proxy, log, or store these requests.
- When you click the extension icon, the current page's content is processed **locally** using Defuddle (text extraction) or Turndown (Markdown conversion). No page content leaves your browser unless you explicitly send it to an AI provider via a chat message.
- 当您在聊天中发送消息时，消息内容和相关页面上下文（如果您选择包含）会**直接从您的浏览器**发送到您配置的 AI API 提供商（如 DeepSeek、SenseNova 或自定义地址）。我们不会代理、记录或存储这些请求。
- 当您点击扩展图标时，当前页面内容会使用 Defuddle（文本提取）或 Turndown（Markdown 转换）**在本地**处理。页面内容不会离开您的浏览器，除非您通过聊天消息明确将其发送给 AI 提供商。

### What data is NOT collected / 不收集的数据

- No analytics, telemetry, or usage tracking / 无分析、遥测或使用跟踪
- No cookies / 无 Cookie
- No personal information (name, email, IP address, etc.) / 无个人信息（姓名、邮箱、IP 地址等）
- No browsing history beyond the current active tab (used only when you click the icon) / 无当前活动标签页以外的浏览历史（仅在点击图标时使用）

## Third-Party Services / 第三方服务

Hupilot does not use any third-party analytics, advertising, or tracking services.
Hupilot 不使用任何第三方分析、广告或跟踪服务。

The only external connections are / 唯一的外部连接是：

1. **Your configured AI API provider** — you control the endpoint URL and API key. Refer to that provider's privacy policy for how they handle your data.
   **您配置的 AI API 提供商** — 您控制端点 URL 和 API 密钥。请参阅该提供商的隐私政策以了解其如何处理您的数据。
2. **Microsoft Edge Add-ons store** — for extension updates and installation management.
   **Microsoft Edge 扩展商店** — 用于扩展更新和安装管理。

## Data Security / 数据安全

Your API key and chat messages are stored in `chrome.storage.local`, which is sandboxed by the browser and not accessible to other extensions or websites. You can remove all stored data at any time via:
您的 API Key 和聊天消息存储在 `chrome.storage.local` 中，该存储空间由浏览器隔离，其他扩展或网站无法访问。您可以随时通过以下方式删除所有存储的数据：

- The "Clear All Chats" button in the extension sidebar / 扩展侧边栏中的"清除所有会话"按钮
- Chrome's extension management page (clear storage) / Chrome 的扩展管理页面（清除存储）

## Children's Privacy / 儿童隐私

Hupilot is not directed at children under 13. We do not knowingly collect any information from children.
Hupilot 不面向 13 岁以下儿童。我们不会有意收集任何儿童的信息。

## Changes to This Policy / 政策变更

If this policy changes, the updated version will be published here with a new revision date.
如果本政策发生变更，更新版本将在此发布并注明新的修订日期。

## Contact / 联系方式

For questions about this privacy policy, please contact the developer via the support information listed in the Microsoft Edge Add-ons store listing.
如对本隐私政策有任何疑问，请通过 Microsoft Edge 扩展商店列表中提供的支持信息联系开发者。
