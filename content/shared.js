// === AI 提供商配置 ===
var AI_PROVIDERS = {
  sensenova: { name: 'SenseNova（目前免费，推荐）', baseUrl: 'https://token.sensenova.cn/v1', models: ['sensenova-6.7-flash-lite', 'deepseek-v4-flash'] },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-v4-pro', 'deepseek-v4-flash'] },
  mimo: { name: 'Mimo', baseUrl: 'https://api.xiaomimimo.com/v1', models: ['mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2-flash'] },
  kilocode: { name: 'KiloCode', baseUrl: 'https://api.kilo.ai/api/gateway', models: ['kilo-auto/free', 'openrouter/free'] },
  agnes: { name: 'Agnes', baseUrl: 'https://apihub.agnes-ai.com/v1', models: ['agnes-2.0-flash', 'agnes-1.5-flash'] },
  custom: { name: '自定义', baseUrl: '', models: [] }
};
var AI_MODEL_CUSTOM = '__custom__';

var AI_DEFAULT_SETTINGS = {
  provider: 'sensenova',
  baseUrl: 'https://token.sensenova.cn/v1',
  model: 'deepseek-v4-flash',
  apiKey: '',
  systemPrompt: '你的名字叫虎宝，你是一只可爱的小老虎',
  maxHistoryRounds: 8,
  thinkingMode: false,
  reasoningEffort: 'medium',
  translateLanguage: '中文',
  pageContentMaxChars: 100000,
  darkMode: 'system',
  selectionPopup: false,
  ttsEnabled: true,
  ttsVoice: '',
  ttsRate: 1.10,
  ttsEdgeDirect: true,
  customQuickActions: [],
  tavilyApiKey: '',
  baiduApiKey: '',
  anysearchApiKey: '',
  webSearchProvider: 'webfetch',
  webSearchMaxResults: 5,
  maxSessions: 50,
  providerKeys: {},
  deskPetAlways: true,
  petSize: 'large',
  outlookReplyCcEnabled: true,
  outlookReplyBccEnabled: false,
  outlookUserInfo: '',
  sleepTimeout: 3,
  sleepTexts: '好多肉\n真好吃\nz  z  z\n吃不下了\n再睡一会儿',
  experimentalWebEdit: false,
  browserControl: false,
  browserUseVision: false,
  pageTranslation: true,
  reminderEnabled: false,
  reminders: [],
  mobileMode: false
};

// === 联网搜索 ===
var WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'searchWeb',
    description: '从互联网搜索实时信息。当用户询问当前时间、最新新闻、实时数据、天气或任何超出你知识范围的内容时使用。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        maxResults: { type: 'number', description: '需要的搜索结果数量，默认20' }
      },
      required: ['query']
    }
  }
};
var WEB_SEARCH_ONCE_TOOL = {
  type: 'function',
  function: {
    name: 'searchWeb',
    description: '从互联网搜索实时信息，将所有需要搜索的内容合并为一个综合性 query，只调用一次。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词（将多个方面合并到一个 query 中）' }
      },
      required: ['query']
    }
  }
};
var FETCH_WEB_PAGE_TOOL = {
  type: 'function',
  function: {
    name: 'fetchWebPage',
    description: '直接获取指定网页的原始内容。当用户提供具体URL需要查看完整页面内容时使用。',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '需要获取内容的网页完整URL，必须以 http:// 或 https:// 开头' }
      },
      required: ['url']
    }
  }
};

function searchWeb(provider, apiKey, query, maxResults) {
  if (provider === 'webfetch') return searchWebFetch(query, maxResults);
  if (!apiKey) return Promise.reject(new Error('未配置搜索引擎 API Key'));
  if (provider === 'tavily') return searchTavily(apiKey, query, maxResults);
  if (provider === 'anysearch') return searchAnySearch(apiKey, query, maxResults);
  return Promise.reject(new Error('不支持的搜索引擎: ' + provider));
}

function searchTavily(apiKey, query, maxResults) {
  if (!isExtensionValid()) return Promise.reject(new Error('扩展已重载，请刷新页面'));
  return new Promise(function(resolve, reject) {
    chrome.runtime.sendMessage({
      type: 'searchRequest',
      provider: 'tavily',
      apiKey: apiKey,
      query: query,
      maxResults: maxResults
    }, function(res) {
      if (res && res.error) return reject(new Error(res.error));
      if (res && res.results) {
        var text = '';
        for (var i = 0; i < res.results.length; i++) {
          var r = res.results[i];
          text += '来源' + (i + 1) + '：' + r.title + '。';
          if (r.content) text += r.content.substring(0, 1000) + '。';
          text += '（' + r.url + '）\n';
        }
        if (res.answer) text = res.answer + '。\n\n' + text;
        resolve(text || '未找到相关结果');
      }
      reject(new Error('搜索失败'));
    });
  });
}

function searchAnySearch(apiKey, query, maxResults) {
  if (!isExtensionValid()) return Promise.reject(new Error('扩展已重载，请刷新页面'));
  return new Promise(function(resolve, reject) {
    chrome.runtime.sendMessage({
      type: 'searchRequest',
      provider: 'anysearch',
      apiKey: apiKey,
      query: query,
      maxResults: maxResults
    }, function(res) {
      if (res && res.error) return reject(new Error(res.error));
      if (res && res.results) {
        var text = '';
        for (var i = 0; i < res.results.length; i++) {
          var r = res.results[i];
          text += '来源' + (i + 1) + '：' + r.title + '。';
          if (r.content) text += r.content.substring(0, 1000) + '。';
          text += '（' + r.url + '）\n';
        }
        resolve(text || '未找到相关结果');
      }
      reject(new Error('搜索失败'));
    });
  });
}

// === WebFetch 搜索（构造搜索 URL 抓取，DOM 解析提取） ===
function searchWebFetch(query, maxResults) {
  if (!isExtensionValid()) return Promise.reject(new Error('扩展已重载，请刷新页面'));
  var searchUrl = 'https://www.baidu.com/s?wd=' + encodeURIComponent(query) + '&rn=' + (maxResults || 20);
  console.log('[WebFetch] fetching URL:', searchUrl);
  return new Promise(function(resolve, reject) {
    chrome.runtime.sendMessage({
      type: 'searchRequest',
      provider: 'webfetch',
      url: searchUrl
    }, function(res) {
      if (res && res.error) return reject(new Error(res.error));
      if (res && res.text) {
        console.log('[WebFetch] raw HTML length:', res.text.length);
        var results = parseBaiduResults(res.text);
        console.log('[WebFetch] parsed results count:', results.length);
        if (results.length === 0) {
          // 降级：stripHtml 兜底
          var fallback = stripHtml(res.text).split('\n').filter(function(l) { return l.trim().length > 10; }).join('\n').substring(0, 5000);
          resolve(fallback || '未找到相关结果');
          return;
        }
        var text = results.map(function(r, i) {
          return '来源' + (i + 1) + '：' + sanitizeText(r.title) + '。' + sanitizeText(r.snippet) + '（' + r.url + '）';
        }).join('\n');
        console.log('[WebFetch] final text:\n' + text.substring(0, 1000));
        resolve(text || '未找到相关结果');
      }
      reject(new Error('搜索失败'));
    });
  });
}

function parseBaiduResults(html) {
  var results = [];
  try {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    // debug: 所有 h3 a
    var allLinks = doc.querySelectorAll('h3 a');
    console.log('[WebFetch] total h3 a count:', allLinks.length);
    allLinks.forEach(function(l, i) {
      console.log('[WebFetch] h3 a[' + i + '] href prefix:', (l.getAttribute('href') || '').substring(0, 80), 'text:', (l.textContent || '').substring(0, 60));
      var p = l.closest('.c-container') || l.closest('.result') || l.parentElement;
      console.log('[WebFetch] h3 a[' + i + '] parent classes:', p ? p.className : 'none');
    });
    // 所有可能的结果容器
    var containers = doc.querySelectorAll('.c-container, .result');
    console.log('[WebFetch] total result containers:', containers.length);
    containers.forEach(function(c, i) {
      console.log('[WebFetch] container[' + i + '] className:', c.className, 'id:', c.id);
      var innerH3 = c.querySelector('h3');
      console.log('[WebFetch] container[' + i + '] h3 text:', innerH3 ? innerH3.textContent.substring(0, 50) : 'none');
    });
    // 百度搜索结果：h3 > a，或者 .t > a
    var links = doc.querySelectorAll('.t a, h3 a, .result h3 a');
    links.forEach(function(link) {
      var href = link.getAttribute('href') || '';
      // 跳过百度内部链接、广告、空白
      if (!href || href.indexOf('baidu.com/s?') !== -1 || href.indexOf('baidujump') !== -1 || href === '#') return;
      var title = link.textContent.trim();
      if (!title || title.length < 3) return;
      // 跳过广告（EC_result 类名）
      var container = link.closest('.c-container') || link.closest('.result') || link.parentElement;
      if (container && container.className.indexOf('EC_result') !== -1) return;
      // 避免重复（百度有时一个结果多个链接）
      for (var i = 0; i < results.length; i++) {
        if (results[i].title === title) return;
      }
      // 找摘要：取容器内的完整文本内容
      var snippet = '';
      if (container) {
        snippet = container.textContent.replace(title, '').replace(/\s+/g, ' ').trim();
      }
      if (!snippet) snippet = title;
      results.push({ title: title, url: href, snippet: snippet.substring(0, 500) });
    });
  } catch (e) {
    console.log('[WebFetch] Baidu parse error:', e.message);
  }
  return results;
}

function sanitizeText(s) {
  return s.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{23CF}\u{23E9}-\u{23F3}\u{231A}-\u{231B}\u{2328}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FB}-\u{25FE}\u{2B05}-\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}]/gu, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\u200B/g, '').replace(/\uFEFF/g, '')
    .trim();
}

// === WebFetch（直接抓取网页） ===
function stripHtml(html) {
  var text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, function(m, c) { return String.fromCharCode(c); })
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  return text;
}

// === 解除复制限制 ===
function enableCopyBypass() {
  var doc = document;
  var head = document.head;
  var body = document.body;
  var html = document.documentElement;
  var jQuery = window.jQuery;
  var userSelectCss = 'user-select: text !important;-webkit-user-select: text !important;-webkit-touch-callout: text !important;';

  function clearElement(el) {
    el.onselectstart = el.oncopy = el.oncut = el.onpaste = el.onkeyup = el.onkeydown = el.oncontextmenu = el.onmousemove = el.onmousedown = el.onmouseup = el.ondragstart = null;
    el.removeAttribute('oncontextmenu');
    el.removeAttribute('ondragstart');
    el.removeAttribute('onselect');
    el.removeAttribute('onselectstart');
    el.removeAttribute('onselectend');
    el.removeAttribute('oncopy');
    el.removeAttribute('onbeforecopy');
    el.removeAttribute('oncut');
    el.removeAttribute('onpaste');
    el.removeAttribute('onclick');
    el.removeAttribute('onkeydown');
    el.removeAttribute('onkeyup');
    el.removeAttribute('onmousedown');
    el.removeAttribute('onmouseup');
    el.removeAttribute('unselectable');
    if (el.style.userSelect) {
      el.setAttribute('style', userSelectCss);
    }
  }

  function handler(event) {
    var t = event.target;
    if (t && (t.id && t.id.indexOf('ai-chat-') === 0 || t.closest && t.closest('#ai-chat-floating-btn, #ai-chat-floating-menu, #ai-chat-sidebar'))) return;
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    event.returnValue = true;
  }

  clearElement(html);
  clearElement(body);
  doc.onselectstart = doc.oncopy = doc.oncut = doc.onpaste = doc.onkeyup = doc.onkeydown = doc.oncontextmenu = doc.onmousemove = doc.onmousedown = doc.onmouseup = doc.ondragstart = null;
  window.onkeyup = window.onkeydown = null;

  var cssId = 'hupilot_user_select';
  if (!document.getElementById(cssId)) {
    var style = document.createElement('style');
    style.id = cssId;
    style.textContent = '*{' + userSelectCss + '}';
    head.appendChild(style);
  }

  var events = ['copy', 'cut', 'contextmenu', 'selectstart', 'mousedown', 'mouseup', 'mousemove', 'keydown', 'keypress', 'keyup'];
  events.forEach(function(evt) {
    document.documentElement.addEventListener(evt, handler, { capture: true });
  });

  var tags = ['html', 'body', 'div', 'p', 'b', 'strong', 'small', 'span', 'pre', 'a', 'form', 'iframe', 'ul', 'li', 'dl', 'dt', 'dd', 'table', 'tr', 'td', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  for (var t = 0; t < tags.length; t++) {
    var els = document.getElementsByTagName(tags[t]);
    for (var i = 0; i < els.length; i++) {
      var obj = els[i];
      if (obj) {
        var style = obj.currentStyle ? obj.currentStyle : window.getComputedStyle(obj, null);
        if (style.userSelect === 'none') {
          obj.setAttribute('style', userSelectCss);
        }
        clearElement(obj);
        var actions = ['select', 'selectstart', 'selectend', 'copy', 'cut', 'paste', 'keydown', 'keyup', 'keypress', 'contextmenu', 'dragstart'];
        for (var j = 0; j < actions.length; j++) {
          obj.addEventListener(actions[j], handler);
        }
      }
    }
  }

  if (jQuery && jQuery(body) && typeof jQuery(body).off !== 'undefined') {
    jQuery(body).off('contextmenu copy cut beforecopy beforecut beforepaste');
  }

  if (window.location.href.indexOf('wenku.baidu.com') >= 0) {
    if (!document.getElementById('hupilot-wenku-hide')) {
      var s = document.createElement('style');
      s.id = 'hupilot-wenku-hide';
      s.textContent = '.pc-vip-cashier-dialog, .editor-plugin-wrap { display: none !important; }';
      document.head.appendChild(s);
    }
  }
}

function fetchWebPage(url) {
  if (!isExtensionValid()) return Promise.reject(new Error('扩展已重载，请刷新页面'));
  return new Promise(function(resolve, reject) {
    chrome.runtime.sendMessage({
      type: 'searchRequest',
      provider: 'webfetch',
      url: url
    }, function(res) {
      if (res && res.error) return reject(new Error(res.error));
      if (res && res.text) {
        var text = stripHtml(res.text).substring(0, 50000);
        if (text.length > 50000) text += '\n\n[内容已截断，仅显示前50000字符]';
        resolve('网页内容（已提取文本）：\n' + text);
      }
      reject(new Error('获取网页失败'));
    });
  });
}

// === 百度搜索流式（通过 port 直连 UI） ===
function searchBaiduStream(provider, apiKey, query, maxResults, onChunk, signal) {
  if (!isExtensionValid()) return Promise.reject(new Error('扩展已重载，请刷新页面'));
  return new Promise(function(resolve, reject) {
    var port = chrome.runtime.connect({ name: 'baiduStream' });
    var url = provider === 'baidu-hp'
      ? 'https://qianfan.baidubce.com/v2/ai_search/web_summary'
      : 'https://qianfan.baidubce.com/v2/ai_search/chat/completions';
    var body = provider === 'baidu-hp'
      ? (function() {
          var now = new Date();
          var dateStr = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日';
          return { messages: [{ role: 'user', content: query }], stream: true,
            instruction: '当前日期是' + dateStr + '。请基于搜索结果直接回答用户问题，提供具体的价格信息、性能参数和对比数据。回答要详细、结构化，使用具体数字和事实。',
            resource_type_filter: [{ type: 'web', top_k: 20 }] };
        })()
      : { messages: [{ role: 'user', content: query }], stream: true, search_mode: 'required', search_source: 'baidu_search_v2', enable_deep_search: false, resource_type_filter: [{ type: 'web', top_k: 5 }] };
    port.postMessage({
      type: 'start',
      url: url,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: body
    });
    var buffer = '';
    var fullContent = '';
    port.onMessage.addListener(function(msg) {
      if (msg.type === 'chunk') {
        buffer += msg.text;
        var lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line || !line.startsWith('data:')) continue;
          var data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            var parsed = JSON.parse(data);
            var choice = parsed.choices && parsed.choices[0];
            if (!choice) continue;
            var delta = choice.delta;
            if (!delta) continue;
            if (delta.content) {
              fullContent += delta.content;
              if (onChunk) onChunk(fullContent);
            }
          } catch (e) {}
        }
      } else if (msg.type === 'done') {
        // 处理 buffer 中残留的 SSE 行（末行可能缺 \n）
        if (buffer.trim()) {
          var remLine = buffer.trim();
          if (remLine.startsWith('data:')) {
            var remData = remLine.slice(5).trim();
            if (remData !== '[DONE]') {
              try {
                var remParsed = JSON.parse(remData);
                var remChoice = remParsed.choices && remParsed.choices[0];
                if (remChoice && remChoice.delta && remChoice.delta.content) {
                  fullContent += remChoice.delta.content;
                  if (onChunk) onChunk(fullContent);
                }
              } catch (e) {}
            }
          }
        }
        // 尝试解析非 SSE 响应（Baidu 标准版无 model 时返回完整 JSON）
        if (!fullContent && buffer.trim()) {
          try {
            var jsonResp = JSON.parse(buffer.trim());
            console.log('[Baidu-standard] parsed jsonResp keys:', Object.keys(jsonResp));
            console.log('[Baidu-standard] references:', jsonResp.references ? jsonResp.references.length + ' items' : 'none');
if (jsonResp.references && jsonResp.references.length > 0) {
              fullContent = jsonResp.references.map(function(r) {
                var summary = sanitizeText(r.snippet || r.content || '');
                if (summary.indexOf(r.title) === 0) {
                  summary = summary.substring(r.title.length).trim();
                }
                return '[' + r.id + '] ' + r.title + ' (' + (r.website || '网页') + ')\n' + summary.substring(0, 600) + '\n';
              }).join('\n---\n');
            }
          } catch (e) {
            console.log('[Baidu] JSON parse failed:', e.message);
          }
        }
        resolve(fullContent);
      } else if (msg.type === 'error') {
        reject(new Error(msg.error));
      }
    });
    if (signal) {
      signal.addEventListener('abort', function() {
        try { port.postMessage({ type: 'abort' }); } catch (e) {}
        port.disconnect();
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    }
  });
}

// === 设置管理 ===
function isExtensionValid() {
  try { return !!chrome.runtime.id; } catch (e) { return false; }
}

function readAISettings() {
  if (!isExtensionValid()) return Promise.resolve(JSON.parse(JSON.stringify(AI_DEFAULT_SETTINGS)));
  return chrome.storage.local.get('aiSettings').then(function(result) {
    var s = result.aiSettings || {};
    var key;
    for (key in AI_DEFAULT_SETTINGS) {
      if (s[key] === undefined) s[key] = AI_DEFAULT_SETTINGS[key];
    }
    if (s.maxSessions > 0) maxSessionsLimit = s.maxSessions;
    return s;
  }).catch(function() {
    // extension context may be temporarily invalid; return defaults
    return JSON.parse(JSON.stringify(AI_DEFAULT_SETTINGS));
  });
}

function saveAISettings(settings) {
  if (settings.maxSessions > 0) maxSessionsLimit = settings.maxSessions;
  return chrome.storage.local.set({ aiSettings: settings }).catch(function() {});
}

// === 多会话管理 ===
var SESSIONS_KEY = 'aiChatSessions';
var sessionsData = null;
var currentSessionId = null;
var sessionOrder = [];
var maxSessionsLimit = 50;

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function initSessions(url) {
  return chrome.storage.local.get(SESSIONS_KEY).then(function(result) {
    var data = result[SESSIONS_KEY] || { sessions: {}, currentSessionId: null, order: [] };
    sessionsData = data.sessions;
    currentSessionId = data.currentSessionId;
    sessionOrder = data.order;

    if (!currentSessionId || !sessionsData[currentSessionId]) {
      return createSession(url);
    }
    return currentSessionId;
  });
}

function getCurrentSession() {
  return sessionsData ? sessionsData[currentSessionId] : null;
}

function getSession(id) {
  return sessionsData ? sessionsData[id] : null;
}

function listSessions() {
  if (!sessionOrder || !sessionsData) return [];
  return sessionOrder.map(function(id) { return sessionsData[id]; }).filter(Boolean);
}

function getDomainKey(url) {
  try { return new URL(url).origin; } catch(e) { return url; }
}

function findSessionByUrl(url) {
  if (!sessionOrder || !sessionsData) return null;
  var domainKey = getDomainKey(url);
  for (var i = sessionOrder.length - 1; i >= 0; i--) {
    var s = sessionsData[sessionOrder[i]];
    if (s && s.url && getDomainKey(s.url) === domainKey) return s;
  }
  return null;
}

function getSessionNameFromTitle(forceName) {
  if (forceName) return forceName;
  var t = (document.title || '').replace(/[/\\?%*:|"<>]/g, '').trim() || '未命名';
  return t.length > 15 ? t.substring(0, 15) + '…' : t;
}

function createSession(url, forceName) {
  if (!sessionsData) return Promise.resolve(null);
  // 优先复用空会话（无消息），同时更新名字
  for (var i = 0; i < sessionOrder.length; i++) {
    var s = sessionsData[sessionOrder[i]];
    if (s && s.messages.length === 0) {
      s.url = url || '';
      s.pageContent = '';
      s.name = getSessionNameFromTitle(forceName);
      s.webSearchEnabled = false;
      currentSessionId = s.id;
      return saveSessions().then(function() { return s.id; });
    }
  }

  var id = generateId();
  sessionsData[id] = {
    id: id,
    name: getSessionNameFromTitle(forceName),
    createdAt: Date.now(),
    url: url || '',
    pageContent: '',
    messages: [],
    contextStartIndex: 0,
    webSearchEnabled: false
  };
  sessionOrder.push(id);
  currentSessionId = id;
  return saveSessions().then(function() { return id; });
}

function switchSession(id) {
  if (!sessionsData || !sessionsData[id]) return Promise.reject('会话不存在');
  currentSessionId = id;
  sessionsData[id].webSearchEnabled = false;
  return saveSessions();
}

function deleteSession(id) {
  if (!sessionsData || !sessionsData[id]) return Promise.reject('会话不存在');
  delete sessionsData[id];
  var idx = sessionOrder.indexOf(id);
  if (idx > -1) sessionOrder.splice(idx, 1);

  if (currentSessionId === id) {
    currentSessionId = sessionOrder.length > 0 ? sessionOrder[sessionOrder.length - 1] : null;
    if (!currentSessionId) {
      return createSession(window.location.href).then(function() { return true; });
    }
  }
  return saveSessions().then(function() { return true; });
}

function renameSession(id, name) {
  if (sessionsData && sessionsData[id]) {
    sessionsData[id].name = name;
    return saveSessions();
  }
  return Promise.reject('会话不存在');
}

function updateSessionPageContent(id, content) {
  if (sessionsData && sessionsData[id]) {
    sessionsData[id].pageContent = content;
    return saveSessions();
  }
  return Promise.reject('会话不存在');
}

function setSessionMessages(id, messages) {
  if (sessionsData && sessionsData[id]) {
    sessionsData[id].messages = messages;
    return saveSessions();
  }
  return Promise.reject('会话不存在');
}

function saveSessions() {
  var limit = maxSessionsLimit || 50;
  if (sessionOrder.length > limit) {
    var toDelete = sessionOrder.slice(0, sessionOrder.length - limit);
    for (var i = 0; i < toDelete.length; i++) {
      delete sessionsData[toDelete[i]];
    }
    sessionOrder = sessionOrder.slice(sessionOrder.length - limit);
  }
  return chrome.storage.local.set({
    [SESSIONS_KEY]: {
      sessions: sessionsData,
      currentSessionId: currentSessionId,
      order: sessionOrder
    }
  }).catch(function() {});
}

// === AI 调用 ===
function xhrRequest(url, apiKey, body) {
  return new Promise(function(resolve, reject) {
    chrome.runtime.sendMessage({
      type: 'aiRequest',
      url: url + '/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: body
    }, function(res) {
      if (res && res.error) return reject(new Error(res.error));
      if (res && res.ok) return resolve(res.text);
      if (res && res.text) return reject(new Error('HTTP ' + res.status + ': ' + res.text.substring(0, 300)));
      reject(new Error('请求失败'));
    });
  });
}

function callAI(settings, messages, onChunk, signal, tools) {
  settings.apiKey = (settings.providerKeys || {})[settings.provider] || settings.apiKey || '';
  var url = settings.baseUrl.replace(/\/+$/, '');
  var body = {
    model: settings.model,
    messages: messages,
    stream: !!onChunk
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
  }
  if (settings.provider === 'deepseek') {
    if (settings.thinkingMode) {
      body.thinking = { type: 'enabled' };
      body.reasoning_effort = settings.reasoningEffort;
    } else {
      body.thinking = { type: 'disabled' };
    }
  }
  if (settings.provider === 'mimo') {
    if (settings.thinkingMode) {
      body.thinking = { type: 'enabled' };
    } else {
      body.thinking = { type: 'disabled' };
    }
  }
  if (settings.provider === 'sensenova') {
    if (settings.thinkingMode) {
      body.reasoning_effort = settings.reasoningEffort;
    } else {
      body.reasoning_effort = 'none';
    }
  }
  if (settings.provider === 'agnes') {
    if (settings.thinkingMode) {
      body.chat_template_kwargs = { enable_thinking: true };
    }
  }
  if (settings.provider === 'kilocode') {
    if (settings.thinkingMode) {
      body.thinking = { type: 'enabled' };
      if (settings.reasoningEffort) {
        body.reasoning_effort = settings.reasoningEffort;
      }
    } else {
      body.thinking = { type: 'disabled' };
    }
  }
  if (onChunk) {
    return streamAI(url, settings.apiKey, body, onChunk, signal);
  }
  return xhrRequest(url, settings.apiKey, body).then(function(text) {
    var json = JSON.parse(text);
    var msg = json.choices && json.choices[0] && json.choices[0].message;
    if (!msg) return '';
    if (msg.tool_calls) return { tool_calls: msg.tool_calls };
    return msg.content || '';
  });
}

function streamAI(url, apiKey, body, onChunk, signal) {
  return new Promise(function(resolve, reject) {
    var port = chrome.runtime.connect({ name: 'aiStream' });

    port.postMessage({
      type: 'start',
      url: url + '/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: body
    });

    var buffer = '';
    var reasoningContent = '';
    var fullContent = '';
    var toolCallAccum = {};
    var hasToolCalls = false;
    var lastFinishReason = null;

    port.onMessage.addListener(function(msg) {
      if (msg.type === 'chunk') {
        buffer += msg.text;
        var lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line || !line.startsWith('data:')) continue;
          var data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            var parsed = JSON.parse(data);
            var choice = parsed.choices && parsed.choices[0];
            if (!choice) continue;
            var delta = choice.delta;
            if (!delta) continue;
            var chunk = {};

            // Reasoning content (various API formats)
            var r = delta.reasoning_content || delta.reasoning || delta.reasoning_text || delta.thinking_content || delta.thinking;
            if (r) {
              reasoningContent += r;
              chunk.reasoning = reasoningContent;
            }

            // Tool calls
            if (delta.tool_calls) {
              hasToolCalls = true;
              delta.tool_calls.forEach(function(tc) {
                var idx = tc.index || 0;
                if (!toolCallAccum[idx]) toolCallAccum[idx] = { function: { arguments: '' } };
                if (tc.id) toolCallAccum[idx].id = tc.id;
                if (tc.type) toolCallAccum[idx].type = tc.type;
                if (tc.function) {
                  if (tc.function.name) toolCallAccum[idx].function.name = tc.function.name;
                  if (tc.function.arguments) toolCallAccum[idx].function.arguments += tc.function.arguments;
                }
              });
            }

            if (delta.content) {
              fullContent += delta.content;
              chunk.content = fullContent;
            }
            if (chunk.reasoning || chunk.content) {
              onChunk(chunk);
            }

            // Capture finish_reason (stop/length)
            if (choice.finish_reason) {
              lastFinishReason = choice.finish_reason;
            }

            // finish_reason indicates tool_calls
            if (choice.finish_reason === 'tool_calls') {
              var tcArr = [];
              for (var k in toolCallAccum) tcArr.push(toolCallAccum[k]);
              resolve({ content: fullContent, reasoning: reasoningContent, tool_calls: tcArr });
              return;
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      } else if (msg.type === 'done') {
        resolve({ content: fullContent, reasoning: reasoningContent, tool_calls: hasToolCalls ? Object.values(toolCallAccum) : undefined, finish_reason: lastFinishReason });
      } else if (msg.type === 'result') {
        try {
          var json = JSON.parse(msg.text);
          var choice = json.choices && json.choices[0];
          if (choice && choice.message && choice.message.tool_calls) {
            resolve({ content: '', reasoning: '', tool_calls: choice.message.tool_calls });
          } else {
            var content = choice && choice.message ? (choice.message.content || '') : '';
            resolve({ content: content, reasoning: '' });
          }
        } catch (e) {
          reject(new Error('解析响应失败'));
        }
      } else if (msg.type === 'error') {
        reject(new Error(msg.error));
      }
    });

    if (signal) {
      signal.addEventListener('abort', function() {
        try { port.postMessage({ type: 'abort' }); } catch (e) {}
        port.disconnect();
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    }
  });
}
