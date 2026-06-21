importScripts('browser/browser-bundle.js');
importScripts('lib/crypto-js.min.js');

// ===== Bilibili 字幕拦截器注册（动态 content script，MAIN world + document_start） =====
// 效果：每次打开 B 站视频页，拦截器在页面 JS 执行前注入
async function registerBiliInterceptor() {
  try {
    var scripts = await chrome.scripting.getRegisteredContentScripts();
    if (scripts.some(function(s) { return s.id === 'bili-subtitle-interceptor'; })) return;
    await chrome.scripting.registerContentScripts([{
      id: 'bili-subtitle-interceptor',
      matches: ['*://www.bilibili.com/video/*'],
      js: ['content/bilibili-subtitle-main.js'],
      world: 'MAIN',
      runAt: 'document_start',
    }]);
  } catch(e) {
    if (e.message.indexOf('Duplicate script ID') < 0) {
      console.log('[bili-sub] register err:', e.message);
    }
  }
}
chrome.runtime.onInstalled.addListener(registerBiliInterceptor);
chrome.runtime.onStartup.addListener(registerBiliInterceptor);
registerBiliInterceptor();

// ===== YouTube 字幕拦截器注册（动态 content script，MAIN world + document_start） =====
async function registerYtInterceptor() {
  try {
    var scripts = await chrome.scripting.getRegisteredContentScripts();
    if (scripts.some(function(s) { return s.id === 'yt-subtitle-interceptor'; })) return;
    await chrome.scripting.registerContentScripts([{
      id: 'yt-subtitle-interceptor',
      matches: ['*://www.youtube.com/watch*', '*://www.youtube.com/shorts/*'],
      js: ['content/youtube-subtitle-main.js'],
      world: 'MAIN',
      runAt: 'document_start',
    }]);
  } catch(e) {
    if (e.message.indexOf('Duplicate script ID') < 0) {
      console.log('[yt-sub] register err:', e.message);
    }
  }
}
chrome.runtime.onInstalled.addListener(registerYtInterceptor);
chrome.runtime.onStartup.addListener(registerYtInterceptor);
registerYtInterceptor();

// ===== Edge TTS 直调引擎（无需 Cloudflare 部署） =====
var edgeTtsTokenCache = null;

function edgeTtsBytesToBase64(bytes) {
  var binary = '';
  for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function edgeTtsBase64ToBytes(base64) {
  var binary = atob(base64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function edgeTtsHmacSha256(key, data) {
  var cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  var sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

async function edgeTtsSign(urlStr) {
  var url = urlStr.split('://')[1];
  var encodedUrl = encodeURIComponent(url);
  var uuidStr = crypto.randomUUID().replace(/-/g, '');
  var now = new Date();
  var formattedDate = now.toUTCString().replace(/GMT/, '').trim() + ' GMT';
  var bytesToSign = 'MSTranslatorAndroidApp' + encodedUrl + formattedDate + uuidStr;
  var key = edgeTtsBase64ToBytes('oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==');
  var sig = await edgeTtsHmacSha256(key, bytesToSign.toLowerCase());
  return 'MSTranslatorAndroidApp::' + edgeTtsBytesToBase64(sig) + '::' + formattedDate + '::' + uuidStr;
}

async function edgeTtsGetToken() {
  if (edgeTtsTokenCache) {
    var now = Date.now() / 1000;
    if (now < edgeTtsTokenCache.exp - 300) return edgeTtsTokenCache;
  }
  var userId = '0f04d16a175c411e';
  try {
    var urls = await chrome.tabs.query({ active: true, currentWindow: true });
    if (urls[0] && urls[0].url) {
      var domain = new URL(urls[0].url).hostname;
      var hash = 0;
      for (var i = 0; i < domain.length; i++) { hash = ((hash << 5) - hash + domain.charCodeAt(i)) | 0; }
      userId = (Math.abs(hash).toString(16).padStart(8, '0') + Math.abs(hash * 31).toString(16).padStart(8, '0')).substring(0, 16);
    }
  } catch (e) {}
  var lastErr;
  for (var attempt = 1; attempt <= 3; attempt++) {
    try {
      var res = await fetch('https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0', {
        method: 'POST',
        headers: {
          'Accept-Language': 'zh-Hans',
          'X-ClientVersion': '4.0.530a 5fe1dc6c',
          'X-UserId': userId,
          'X-HomeGeographicRegion': 'zh-Hans-CN',
          'X-ClientTraceId': crypto.randomUUID().replace(/-/g, ''),
          'X-MT-Signature': await edgeTtsSign('https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0'),
          'User-Agent': 'okhttp/4.5.0',
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': '0',
          'Accept-Encoding': 'gzip'
        }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      var jwt = JSON.parse(atob(data.t.split('.')[1]));
      edgeTtsTokenCache = { r: data.r, t: data.t, exp: jwt.exp };
      return edgeTtsTokenCache;
    } catch (e) { lastErr = e; if (attempt < 3) await new Promise(function(r) { setTimeout(r, 1000 * attempt); }); }
  }
  if (edgeTtsTokenCache) return edgeTtsTokenCache;
  throw new Error('Edge TTS token failed: ' + (lastErr && lastErr.message));
}

async function edgeTtsGetAudio(text, voiceName, rate, pitch, style, role, styleDegree) {
  var ep = await edgeTtsGetToken();
  var url = 'https://' + ep.r + '.tts.speech.microsoft.com/cognitiveservices/v1';
  var escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  var rateStr = ((rate - 1) * 100).toFixed(0);
  var pitchStr = ((pitch - 1) * 100).toFixed(0);
  var prosody = '<prosody rate="' + rateStr + '%" pitch="' + pitchStr + '%">' + escaped + '</prosody>';
  if (role) prosody = '<mstts:express-as role="' + role + '">' + prosody + '</mstts:express-as>';
  if (style && style !== 'general') {
    var styleAttr = styleDegree !== 1.0 ? ' styledegree="' + styleDegree + '"' : '';
    prosody = '<mstts:express-as style="' + style + '"' + styleAttr + '>' + prosody + '</mstts:express-as>';
  }
  var ssml = '<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="zh-CN"><voice name="' + voiceName + '">' + prosody + '</voice></speak>';
  var res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: ep.t,
      'Content-Type': 'application/ssml+xml',
      'User-Agent': 'okhttp/4.5.0',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3'
    },
    body: ssml
  });
  if (!res.ok) throw new Error('Edge TTS error: ' + res.status);
  return await res.blob();
}

async function edgeTtsConvertToBase64(blob) {
  var ab = await blob.arrayBuffer();
  var bytes = new Uint8Array(ab);
  var binary = '';
  var chunkSize = 8192;
  for (var i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

async function edgeTtsHandleRequest(text, voice, rate, pitch, style, role, styleDegree) {
  return edgeTtsGetAudio(text, voice, rate, pitch, style, role, styleDegree);
}

// === HTTP 流式 Edge TTS（ReadableStream → 逐 chunk 推送） ===
chrome.runtime.onConnect.addListener(function(port) {
  if (port.name !== 'ttsEdgeDirectStream') return;
  var aborter = null;

  port.onMessage.addListener(async function(msg) {
    if (msg.type === 'speak') {
      try {
        var ep = await edgeTtsGetToken();
        var url = 'https://' + ep.r + '.tts.speech.microsoft.com/cognitiveservices/v1';
        var text = msg.text, voice = msg.voice || 'zh-CN-XiaoxiaoNeural';
        var rate = msg.rate || 1.0, pitch = msg.pitch || 1.0;
        var style = msg.style || 'general', role = msg.role || '', styleDegree = msg.styleDegree || 1.0;
        var escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var rateStr = ((rate - 1) * 100).toFixed(0);
        var pitchStr = ((pitch - 1) * 100).toFixed(0);
        var prosody = '<prosody rate="' + rateStr + '%" pitch="' + pitchStr + '%">' + escaped + '</prosody>';
        if (role) prosody = '<mstts:express-as role="' + role + '">' + prosody + '</mstts:express-as>';
        if (style && style !== 'general') {
          var sa = styleDegree !== 1.0 ? ' styledegree="' + styleDegree + '"' : '';
          prosody = '<mstts:express-as style="' + style + '"' + sa + '>' + prosody + '</mstts:express-as>';
        }
        var ssml = '<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="zh-CN"><voice name="' + voice + '">' + prosody + '</voice></speak>';

        aborter = new AbortController();
        var res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: ep.t, 'Content-Type': 'application/ssml+xml', 'User-Agent': 'okhttp/4.5.0', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3' },
          body: ssml,
          signal: aborter.signal
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);

        var reader = res.body.getReader();
        while (true) {
          var r = await reader.read();
          if (r.done) break;
          if (r.value && r.value.length > 0) {
            port.postMessage({ type: 'audio', data: edgeTtsBytesToBase64(r.value), size: r.value.length });
          }
        }
        port.postMessage({ type: 'end' });
      } catch (e) {
        if (e.name === 'AbortError') return;
        console.error('[TTS-Stream] Error:', e.message);
        port.postMessage({ type: 'error', msg: e.message });
      }
    }
    if (msg.type === 'cancel') {
      if (aborter) { try { aborter.abort(); } catch(e) {} aborter = null; }
    }
  });

  port.onDisconnect.addListener(function() {
    if (aborter) { try { aborter.abort(); } catch(e) {} aborter = null; }
  });
});

// AI 代理 + 扩展图标点击转发

chrome.action.onClicked.addListener(function(tab) {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['lib/defuddle.js']
  }).catch(function() {});
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: function() {
      document.dispatchEvent(new CustomEvent('aiChatToggle'));
    }
  }).catch(function() {});
});

function updateTranslateMenuVisibility() {
  chrome.storage.local.get('aiSettings').then(function(data) {
    var visible = data.aiSettings && data.aiSettings.pageTranslation === true;
    chrome.contextMenus.update('translatePage', { visible: !!visible }, function() { chrome.runtime.lastError; });
  }).catch(function() {});
}

function updateBrowserControlMenuVisibility() {
  chrome.storage.local.get('aiSettings').then(function(data) {
    var visible = data.aiSettings && data.aiSettings.browserControl === true;
    chrome.contextMenus.update('openBrowserPanel', { visible: !!visible }, function() { chrome.runtime.lastError; });
    chrome.contextMenus.update('captureFullPage', { visible: !!visible }, function() { chrome.runtime.lastError; });
  }).catch(function() {});
}

function createAllContextMenus() {
  var menus = [
    { id: 'aiChatToggle', title: '呼叫虎宝', contexts: ['page', 'selection', 'link'] },
    { id: 'openSettings', title: '设置选项', contexts: ['action'] },
    { id: 'unlockRestrictions', title: '解除网页限制', contexts: ['action'] },
    { id: 'resetDeskPet', title: '桌宠位置复原', contexts: ['action'] },
    { id: 'translatePage', title: '翻译网页', contexts: ['action'] },
    { id: 'openBrowserPanel', title: '进入浏览器操控模式', contexts: ['action'], visible: false },
    { id: 'captureFullPage', title: '截取网页长截图', contexts: ['action'], visible: false },
  ];
  menus.forEach(function(m) {
    chrome.contextMenus.create(m, function() { var e = chrome.runtime.lastError; });
  });
  updateTranslateMenuVisibility();
  updateBrowserControlMenuVisibility();
}

createAllContextMenus();

chrome.runtime.onInstalled.addListener(function() {
  createAllContextMenus();
});

chrome.storage.onChanged.addListener(function(changes, area) {
  if (area === 'local' && changes.aiSettings) {
    updateTranslateMenuVisibility();
    updateBrowserControlMenuVisibility();
  }
});
chrome.contextMenus.onClicked.addListener(function(info, tab) {
  if (info.menuItemId === 'aiChatToggle') {
    var tabId = tab.id;
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function() {
        if (document.getElementById('ai-chat-sidebar')) {
          document.dispatchEvent(new CustomEvent('aiChatToggle'));
          return true;
        }
        return false;
      }
    }).then(function(r) {
      if (r && r[0] && r[0].result) return;
      chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ['content/chat.css']
      }).catch(function() {});
      var jsFiles = ['content/shared.js', 'content/site-registry.js', 'content/browser-tools.js', 'content/optimizers/outlook.js', 'lib/marked.min.js', 'content/chat.js'];
      return Promise.all(jsFiles.map(function(f) {
        return chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: [f]
        }).catch(function() {});
      })).then(function() {
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: function() {
            document.dispatchEvent(new CustomEvent('aiChatToggle'));
          }
        }).catch(function() {});
      });
    }).catch(function() {});
  } else if (info.menuItemId === 'openSettings') {
    var tabId = tab.id;
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function() {
        if (document.getElementById('ai-chat-sidebar')) {
          document.dispatchEvent(new CustomEvent('aiChatOpenSettings'));
          return true;
        }
        return false;
      }
    }).then(function(r) {
      if (r && r[0] && r[0].result) return;
      chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ['content/chat.css']
      }).catch(function() {});
      var jsFiles = ['content/shared.js', 'content/site-registry.js', 'content/browser-tools.js', 'content/optimizers/outlook.js', 'lib/marked.min.js', 'content/chat.js'];
      return Promise.all(jsFiles.map(function(f) {
        return chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: [f]
        }).catch(function() {});
      })).then(function() {
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: function() {
            document.dispatchEvent(new CustomEvent('aiChatOpenSettings'));
          }
        }).catch(function() {});
      });
    }).catch(function() {});
  } else if (info.menuItemId === 'translatePage') {
    var tabId = tab.id;
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function() {
        document.dispatchEvent(new CustomEvent('aiChatTranslatePage'));
      }
    }).catch(function(){});
  } else if (info.menuItemId === 'resetDeskPet') {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function() {
        document.dispatchEvent(new CustomEvent('aiChatResetDeskPet'));
      }
    }).catch(function(){});
  } else if (info.menuItemId === 'unlockRestrictions') {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function() {
        if (confirm('\u662F\u5426\u9700\u8981\u89E3\u9664\u7F51\u7AD9\u5BF9\u53F3\u952E\u53CA\u590D\u5236\u7684\u9650\u5236\uFF1F\u5982\u4E0D\u9700\u8981\uFF0C\u8BF7\u70B9\u53D6\u6D88\u3002')) {
          if (typeof enableCopyBypass === 'function') {
            enableCopyBypass();
            var t = document.createElement('div');
            t.textContent = '\u5DF2\u89E3\u9664\u7F51\u7AD9\u5BF9\u53F3\u952E\u53CA\u590D\u5236\u7684\u9650\u5236\u3002\u5982\u9700\u64A4\u9500\uFF0C\u8BF7\u5237\u65B0\u7F51\u9875\u3002';
            Object.assign(t.style, {
              position:'fixed',bottom:'30px',left:'50%',transform:'translateX(-50%)',
              background:'#333',color:'#fff',padding:'10px 20px',borderRadius:'8px',
              zIndex:2147483647,fontSize:'14px',fontFamily:'sans-serif'
            });
                      document.body.appendChild(t);
            setTimeout(function(){t.remove()},3000);
          }
        }
      }
    }).catch(function(){});
  } else if (info.menuItemId === 'captureFullPage') {
    captureFullPageScreenshot(tab).catch(function(e) {
      console.log('[captureFullPage] error:', e.message);
    });
  } else if (info.menuItemId === 'openBrowserPanel') {
    chrome.sidePanel.open({ tabId: tab.id }).catch(function(e) { console.log('[sidePanel] open error: ' + (e && e.message)); });
  }
});

// === Track page translation state for context menu ===
var ptTabState = {};

chrome.tabs.onActivated.addListener(function(info) {
  var state = ptTabState[info.tabId] || 'idle';
  if (state === 'translated') {
    chrome.contextMenus.update('translatePage', { title: '还原原文' });
  } else {
    chrome.contextMenus.update('translatePage', { title: '翻译网页' });
  }
});

// ===== Bilibili 字幕预捕获（注入 MAIN-world 拦截器，同时拦截 fetch + XHR） =====
chrome.webNavigation.onDOMContentLoaded.addListener(function(details) {
  if (details.frameId !== 0) return;
  var url = details.url || '';
  if (url.indexOf('bilibili.com/video/') < 0) return;
  chrome.scripting.executeScript({
    target: { tabId: details.tabId },
    world: 'MAIN',
    func: function() {
      if (window.__BILI_INTERCEPTOR__) return;
      window.__BILI_INTERCEPTOR__ = true;
      // 拦截 fetch
      var X = window.fetch.bind(window);
      window.fetch = function(u, o) {
        return X(u, o).then(function(r) {
          if (typeof u === 'string' && u.indexOf('player/wbi/v2') >= 0) {
            captureSubtitleResponse(r.clone());
          }
          return r;
        });
      };
      // 拦截 XMLHttpRequest（prototype 方式，不破坏 instanceof）
      var origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url) {
        this._biliUrl = typeof url === 'string' ? url : null;
        return origOpen.apply(this, arguments);
      };
      var origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
          if (this._biliUrl && this._biliUrl.indexOf('player/wbi/v2') >= 0) {
            try {
              var body = JSON.parse(this.responseText);
              captureSubtitleResponse({ json: function() { return Promise.resolve(body); } });
            } catch(e) {}
          }
        });
        return origSend.apply(this, arguments);
      };
      // 字幕处理函数（只取一种语言，中文优先）
      function captureSubtitleResponse(resp) {
        resp.json().then(function(b) {
          if (b.code !== 0 || !b.data || !b.data.subtitle) {
            // API 异常或没有 subtitle 字段，也存一个空结果避免无限等待
            window.__BILI_SUBTITLE_CACHE__ = { aid: (b.data||{}).aid, cid: (b.data||{}).cid, subtitles: [] };
            return;
          }
          var ss = b.data.subtitle.subtitles;
          if (!ss || !ss.length) {
            // 有 subtitle 字段但列表为空（视频没有字幕）
            window.__BILI_SUBTITLE_CACHE__ = { aid: b.data.aid, cid: b.data.cid, subtitles: [] };
            return;
          }
          // 按优先级选择：zh-Hans → zh-Hant → zh-* → ai-zh → 第一个非中文 → 第一个
          var chinesePriority = ['zh-Hans', 'zh-CN', 'zh-SG', 'zh-MY', 'zh-Hant', 'zh-HK', 'zh-TW', 'zh', 'ai-zh'];
          var best = null, bestScore = 999;
          for (var i = 0; i < ss.length; i++) {
            if (!ss[i].subtitle_url) continue;
            var idx = chinesePriority.indexOf(ss[i].lan);
            var score = idx >= 0 ? idx : 100; // 非中文统一100
            if (score < bestScore) { bestScore = score; best = ss[i]; }
          }
          if (!best) {
            // 所有字幕 URL 均为空（AI 字幕尚未生成），标记为空避免无限等待
            window.__BILI_SUBTITLE_CACHE__ = { aid: b.data.aid, cid: b.data.cid, subtitles: [] };
            return;
          }
          var su = best.subtitle_url.startsWith('//') ? 'https:' + best.subtitle_url : best.subtitle_url;
          window.fetch(su).then(function(r2) { return r2.json(); }).then(function(d) {
            var sg = (d.body || []).map(function(x) { return { from: x.from, to: x.to, text: x.content }; });
            window.__BILI_SUBTITLE_CACHE__ = { aid: b.data.aid, cid: b.data.cid, subtitles: [{ lan: best.lan, lan_doc: best.lan_doc, segments: sg, total: sg.length }] };
            window.postMessage({ type: 'biliSubtitleReady' }, '*');
          }).catch(function() {});
        }).catch(function() {});
      }
    }
  }).then(function() {
    console.log('[bili-sub] injected for tab', details.tabId);
  }).catch(function(err) {
    console.log('[bili-sub] inject err:', err.message);
  });
});

// === Inject TTS into page world (to access Edge neural voices) ===
chrome.runtime.onMessage.addListener(function(m, s, r) {
  var _r = r;
  r = function(data) { try { if (!chrome.runtime.lastError) _r(data); } catch(e) {} };
  if (m.type === 'ptStateChanged') {
    ptTabState[s.tab.id] = m.state;
    if (m.state === 'translated') {
      chrome.contextMenus.update('translatePage', { title: '还原原文' });
    } else {
      chrome.contextMenus.update('translatePage', { title: '翻译网页' });
    }
    return;
  }
  if (m.type === 'ttsEdgeDirect') {
    (async function() {
      try {
        var blob = await edgeTtsHandleRequest(m.text, m.voice || 'zh-CN-XiaoxiaoNeural', m.rate || 1.0, m.pitch || 1.0, m.style || 'general', m.role || '', m.styleDegree || 1.0);
        var audio = await edgeTtsConvertToBase64(blob);
        r({ ok: true, audio: audio, size: blob.size });
      } catch (e) {
        r({ error: e.message });
      }
    })();
    return true;
  }
  if (m.type === 'injectTTS') {
    chrome.scripting.executeScript({
      target: { tabId: s.tab.id },
      world: 'MAIN',
      func: function() {
        if (document.getElementById('__ai-tts-injected')) return;
        var marker = document.createElement('div');
        marker.id = '__ai-tts-injected';
        marker.style.display = 'none';
        document.documentElement.appendChild(marker);
        function pickVoice() {
          var v = speechSynthesis.getVoices();
          var t = v.filter(function(x) { return x.name.indexOf('Xiaoxiao') >= 0 || x.name.indexOf('晓晓') >= 0; });
          if (t.length > 0) return t[0];
          var z = v.filter(function(x) { return x.lang && x.lang.startsWith('zh') && x.name.indexOf('Online') >= 0; });
          if (z.length > 0) return z[0];
          var a = v.filter(function(x) { return x.lang && x.lang.startsWith('zh'); });
          return a.length > 0 ? a[0] : null;
        }
        function findVoice(voiceId) {
          if (!voiceId) return pickVoice();
          var v = speechSynthesis.getVoices();
          var m = v.find(function(x) { return x.voiceURI === voiceId || x.name === voiceId; });
          if (m) return m;
          var parts = voiceId.split('-');
          var keyword = parts[parts.length - 1].replace('Neural', '');
          var lang = parts.slice(0, 2).join('-');
          m = v.find(function(x) { return x.lang.startsWith(lang) && x.name.indexOf(keyword) >= 0; });
          if (m) return m;
          return pickVoice();
        }
        window.addEventListener('message', function(e) {
          if (e.source !== window) return;
          var d = e.data;
          if (!d || d.type !== '__TTS_SPEAK' && d.type !== '__TTS_STOP') return;
          if (d.type === '__TTS_STOP') {
            speechSynthesis.cancel();
            return;
          }
          if (d.type === '__TTS_SPEAK') {
            speechSynthesis.cancel();
            var u = new SpeechSynthesisUtterance(d.text);
            u.lang = 'zh-CN'; u.rate = d.rate || 1.0; u.pitch = 1.0; u.volume = 1.0;
            u.onend = function() { window.postMessage({ type: '__TTS_END' }, '*'); };
            u.onerror = function() { window.postMessage({ type: '__TTS_END' }, '*'); };
            var v = findVoice(d.voiceId); if (v) u.voice = v;
            speechSynthesis.speak(u);
          }
        });
        speechSynthesis.getVoices();
        speechSynthesis.onvoiceschanged = function() { speechSynthesis.getVoices(); };
      }
    }).then(function() {
      r({ success: true });
    }).catch(function(err) {
      r({ error: err.message });
    });
    return true;
  }
  if (m.type === 'searchRequest') {
    (async function() {
      try {
        if (m.provider === 'tavily') {
          var res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: m.apiKey,
              query: m.query,
              max_results: m.maxResults || 5,
              include_answer: true
            })
          });
          if (res.ok) {
            var tavilyData = await res.json();
            console.log('[Tavily] response:', JSON.stringify(tavilyData).substring(0, 500));
            r({ ok: true, answer: tavilyData.answer || '', results: tavilyData.results || [] });
          } else { r({ error: 'Tavily HTTP ' + res.status + ': ' + (await res.text()).substring(0, 200) }); }
        } else if (m.provider === 'anysearch') {
          var asUrl = 'https://api.anysearch.com/v1/search';
          var asBody = { query: m.query, max_results: m.maxResults || 10 };
          var asHeaders = { 'Content-Type': 'application/json' };
          if (m.apiKey) asHeaders['Authorization'] = 'Bearer ' + m.apiKey;
          var asRes = await fetch(asUrl, { method: 'POST', headers: asHeaders, body: JSON.stringify(asBody) });
          if (asRes.ok) {
            var asData = await asRes.json();
            console.log('[AnySearch] response:', JSON.stringify(asData).substring(0, 500));
            r({ ok: true, results: asData.data && asData.data.results || [] });
          } else { r({ error: 'AnySearch HTTP ' + asRes.status + ': ' + (await asRes.text()).substring(0, 200) }); }
        } else if (m.provider === 'webfetch') {
          var wfRes = await fetch(m.url);
          if (wfRes.ok) {
            r({ ok: true, text: await wfRes.text() });
          } else {
            r({ error: 'WebFetch HTTP ' + wfRes.status });
          }
        } else {
          r({ error: '不支持的搜索引擎: ' + m.provider });
        }
      } catch (e) { r({ error: e.message }); }
    })();
    return true;
  }
  if (m.type === 'injectDefuddle') {
    chrome.scripting.executeScript({
      target: { tabId: s.tab.id },
      files: ['lib/defuddle.js']
    }).then(function() {
      r({ success: true });
    }).catch(function(err) {
      r({ error: err.message });
    });
    return true;
  }
  if (m.type === 'injectPageTranslator') {
    chrome.scripting.executeScript({
      target: { tabId: s.tab.id },
      files: ['content/page-translate.js']
    }).then(function() {
      r({ success: true });
    }).catch(function(err) {
      r({ error: err.message });
    });
    return true;
  }
  if (m.type === 'injectTurndown') {
    chrome.scripting.executeScript({
      target: { tabId: s.tab.id },
      files: ['lib/turndown.js', 'content/markdown-converter.js']
    }).then(function() {
      r({ success: true });
    }).catch(function(err) {
      r({ error: err.message });
    });
    return true;
  }
  if (m.type === 'injectEditor') {
    chrome.scripting.executeScript({
      target: { tabId: s.tab.id },
      files: ['content/html-editor.js']
    }).then(function() {
      r({ success: true });
    }).catch(function(err) {
      r({ error: err.message });
    });
    return true;
  }
  if (m.type === 'triggerDownload') {
    chrome.scripting.executeScript({
      target: { tabId: s.tab.id },
      world: 'MAIN',
      func: function(html, fileName) {
        var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
      },
      args: [m.html, m.fileName]
    }).then(function() {
      r({ success: true });
    }).catch(function(err) {
      r({ error: err.message });
    });
    return true;
  }
  if (m.type === 'fetchPdfFile') {
    fetch(m.url).then(function(resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.arrayBuffer();
    }).then(function(buffer) {
      var bytes = new Uint8Array(buffer);
      var binary = '';
      for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      r({ data: btoa(binary) });
    }).catch(function(err) {
      r({ error: err.message });
    });
    return true;
  }
  if (m.type === 'injectPdfReader') {
    var pdfUrl = chrome.runtime.getURL('lib/pdf.min.mjs');
    var workerUrl = chrome.runtime.getURL('lib/pdf.worker.min.mjs');
    chrome.scripting.executeScript({
      target: { tabId: s.tab.id },
      world: 'MAIN',
      func: function(pdfUrl, workerUrl) {
        if (document.getElementById('__pdf-reader-injected')) return;
        var marker = document.createElement('div');
        marker.id = '__pdf-reader-injected';
        marker.style.display = 'none';
        document.documentElement.appendChild(marker);
        console.log('[PDF-MAIN] injected, pdfUrl=' + pdfUrl + ' workerUrl=' + workerUrl);
        window.addEventListener('message', async function(e) {
          if (e.source !== window || !e.data) return;
          if (e.data.type === '__PDF_EXTRACT') {
            console.log('[PDF-MAIN] got EXTRACT request, hasData=' + !!e.data.data + ' pdfUrl=' + e.data.pdfUrl);
            try {
              var text = '', i, spans, pageContainers;

              // Method 1: Extract text from Chrome PDF viewer's DOM text layer
              pageContainers = document.querySelectorAll('.pageContainer, #viewer .page');
              console.log('[PDF-MAIN] pageContainers found: ' + pageContainers.length);
              for (i = 0; i < pageContainers.length; i++) {
                spans = pageContainers[i].querySelectorAll('.textLayer span:not([role="presentation"])');
                console.log('[PDF-MAIN] pageContainer ' + i + ' textLayer spans: ' + spans.length);
                for (var s = 0; s < spans.length; s++) {
                  text += spans[s].textContent + '\n';
                }
              }
              if (text.length > 0) {
                console.log('[PDF-MAIN] DOM text extraction done, chars=' + text.length);
                window.postMessage({ type: '__PDF_RESULT', text: text }, '*');
                return;
              }

              // Method 2: Try window.PDFViewerApplication (Chrome/Edge viewer API)
              try {
                var app = window.PDFViewerApplication || window.PDFViewer;
                if (app && app.pdfDocument) {
                  console.log('[PDF-MAIN] using viewer pdfDocument');
                  var pdfDoc = app.pdfDocument;
                  for (i = 1; i <= pdfDoc.numPages; i++) {
                    var page = await pdfDoc.getPage(i);
                    var content = await page.getTextContent();
                    text += content.items.map(function(item) { return item.str; }).join(' ') + '\n';
                  console.log('[PDF-MAIN] viewer extraction done, chars=' + text.length);
                  window.postMessage({ type: '__PDF_RESULT', text: text }, '*');
                  return;
                }
              }
            } catch (e) { console.log('[PDF-MAIN] viewer API failed: ' + e.message); }

              // Method 3: Load pdf.js, use provided data (fetched by background.js for file://)
              console.log('[PDF-MAIN] loading pdf.js');
              var pdfjsLib = await import(pdfUrl);
              var workerResp = await fetch(workerUrl);
              var workerBlob = await workerResp.blob();
              var workerBlobUrl = URL.createObjectURL(workerBlob);
              pdfjsLib.GlobalWorkerOptions.workerSrc = workerBlobUrl;

              var data = e.data.data;
              if (!data) throw new Error('未收到 PDF 数据');
              var pdfDoc2 = await pdfjsLib.getDocument({ data: data }).promise;
              console.log('[PDF-MAIN] PDF loaded, pages=' + pdfDoc2.numPages);
              for (i = 1; i <= pdfDoc2.numPages; i++) {
                var pg = await pdfDoc2.getPage(i);
                var ct = await pg.getTextContent();
                text += ct.items.map(function(item) { return item.str; }).join(' ') + '\n';
              }
              console.log('[PDF-MAIN] extraction done, total chars=' + text.length);
              window.postMessage({ type: '__PDF_RESULT', text: text }, '*');
            } catch (err) {
              console.log('[PDF-MAIN] error: ' + err.message);
              window.postMessage({ type: '__PDF_RESULT', error: err.message }, '*');
            }
          }
        });
        console.log('[PDF-MAIN] posting READY');
        window.postMessage({ type: '__PDF_READY' }, '*');
      },
      args: [pdfUrl, workerUrl]
    }).then(function() {
      r({ success: true });
    }).catch(function(err) {
      r({ error: err.message });
    });
    return true;
  }
  if (m.type === 'captureFullPage') {
    if (s.tab && s.tab.id) {
      captureFullPageScreenshot(s.tab).catch(function(e) { console.log('[captureFullPage] error:', e.message); });
    }
    return;
  }
  if (m.type === 'openBrowserPanel') {
    if (s.tab && s.tab.id) {
      chrome.sidePanel.open({ tabId: s.tab.id }).catch(function(e) { console.log('[sidePanel] open msg err: ' + (e && e.message)); });
    }
    return;
  }
  if (m.type === 'bilibiliSubtitle') {
    if (!s.tab || !s.tab.id) { r({ error: 'no_tab' }); return; }
    // 轮询等待字幕缓存（最多 15 秒）
    var pollTabId = s.tab.id;
    var pollCount = 0;
    function pollCache() {
      chrome.scripting.executeScript({
        target: { tabId: pollTabId },
        world: 'MAIN',
        func: function() {
          var c = window.__BILI_SUBTITLE_CACHE__;
          var injected = !!window.__BILI_INTERCEPTOR__;
          if (c) {
            // 补充 title、bvid、author 信息（从 __INITIAL_STATE__ 获取）
            try {
              var st = window.__INITIAL_STATE__;
              if (st) {
                if (!c.title && st.videoData) c.title = st.videoData.title;
                if (!c.bvid) c.bvid = st.bvid;
                if (!c.author && st.upData) {
                  c.author = { name: st.upData.name, mid: st.upData.mid, face: st.upData.face };
                }
              }
            } catch(e) {}
            return c;
          }
          return { error: 'not_ready', injected: injected };
        }
      }).then(function(results) {
        var res = results && results[0] && results[0].result;
        if (res && !res.error) {
          r(res);
        } else if (pollCount >= 30) {
          r(res || { error: 'timeout', msg: '等待字幕超时' });
        } else {
          pollCount++;
          setTimeout(pollCache, 500);
        }
      }).catch(function(err) {
        if (pollCount >= 30) { r({ error: err.message }); return; }
        pollCount++;
        setTimeout(pollCache, 500);
      });
    }
    pollCache();
    return true;
  }
  if (m.type === 'youtubeSubtitle') {
    if (!s.tab || !s.tab.id) { console.log('[YT-BG] no tab'); r({ error: 'no_tab' }); return; }
    console.log('[YT-BG] polling start tab=' + s.tab.id);
    var pollTabId = s.tab.id;
    var pollCount = 0;
    function pollYtCache() {
      chrome.scripting.executeScript({
        target: { tabId: pollTabId },
        world: 'MAIN',
        func: function() {
          var c = window.__YT_SUBTITLE_CACHE__;
          if (c) {
            try {
              if (!c.title) c.title = (document.title || '').replace(' - YouTube', '');
              if (!c.author) {
                var el = document.querySelector('#owner #channel-name a');
                if (el) c.author = el.textContent.trim();
              }
            } catch(e) {}
            return c;
          }
          return { error: 'not_ready' };
        }
      }).then(function(results) {
        var res = results && results[0] && results[0].result;
        console.log('[YT-BG] poll#' + pollCount + ' res:', res ? (res.error || 'subtitles:' + (res.subtitles ? res.subtitles.length : 'none')) : 'no result');
        if (res && !res.error) {
          r(res);
        } else if (pollCount >= 30) {
          r(res || { error: 'timeout', msg: '等待字幕超时' });
        } else {
          pollCount++;
          setTimeout(pollYtCache, 500);
        }
      }).catch(function(err) {
        console.log('[YT-BG] poll err:', err.message);
        if (pollCount >= 30) { r({ error: err.message }); return; }
        pollCount++;
        setTimeout(pollYtCache, 500);
      });
    }
    pollYtCache();
    return true;
  }
  if (m.type !== 'aiRequest') return;
  (async function() {
    try {
      var h = {}, k;
      for (k in m.headers) h[k] = m.headers[k];
      var res = await fetch(m.url, {
        method: 'POST',
        headers: h,
        body: JSON.stringify(m.body)
      });
      if (res.ok) { r({ ok: true, status: res.status, text: await res.text() }); } else { r({ ok: false, status: res.status, text: await res.text() }); }
    } catch (e) {
      r({ error: e.message });
    }
  })();
  return true;
});

// === AI 流式代理（长连接） ===
chrome.runtime.onConnect.addListener(function(p) {
  if (p.name === 'aiStream') {
    var ac = null, started = false;

    p.onMessage.addListener(async function(m) {
      if (m.type !== 'start' && m.type !== 'abort') return;

      if (m.type === 'abort') {
        if (ac) { ac.abort(); ac = null; }
        return;
      }

      if (started) return;
      started = true;
      ac = new AbortController();

      try {
        var h = {}, k;
        for (k in m.headers) h[k] = m.headers[k];
        var res = await fetch(m.url, {
          method: 'POST',
          headers: h,
          body: JSON.stringify(m.body),
          signal: ac.signal
        });

        if (!res.ok) {
          var errText = await res.text();
          var errMsg = errText ? errText.substring(0, 300) : '';
          p.postMessage({ type: 'error', error: 'HTTP ' + res.status + (errMsg ? ': ' + errMsg : '') });
          return;
        }

        if (m.body.stream) {
          var rd = res.body.getReader();
          var dec = new TextDecoder();
          var ft = '';
          while (true) {
            var c = await rd.read();
            if (c.done) break;
            var t = dec.decode(c.value, { stream: true });
            ft += t;
            p.postMessage({ type: 'chunk', text: t, fullText: ft });
          }
          p.postMessage({ type: 'done' });
        } else {
          var txt = await res.text();
          p.postMessage({ type: 'result', text: txt });
        }
      } catch (e) {
        try { p.postMessage({
          type: 'error',
          error: e.name === 'AbortError' ? 'Aborted' : e.message
        }); } catch(ex) {}
      }
    });

    p.onDisconnect.addListener(function() {
      if (ac) { ac.abort(); ac = null; }
    });
  }

  if (p.name === 'baiduStream') {
    var bdAc = null, bdStarted = false;

    p.onMessage.addListener(async function(m) {
      if (m.type !== 'start' && m.type !== 'abort') return;

      if (m.type === 'abort') {
        if (bdAc) { bdAc.abort(); bdAc = null; }
        return;
      }

      if (bdStarted) return;
      bdStarted = true;
      bdAc = new AbortController();

      try {
        var hd = {}, kd;
        for (kd in m.headers) hd[kd] = m.headers[kd];
        var bdRes = await fetch(m.url, {
          method: 'POST',
          headers: hd,
          body: JSON.stringify(m.body),
          signal: bdAc.signal
        });

        if (!bdRes.ok) {
          var bdErr = await bdRes.text();
          console.log('[Baidu bg] HTTP error:', bdRes.status, bdErr.substring(0, 500));
          p.postMessage({ type: 'error', error: 'Baidu HTTP ' + bdRes.status + ': ' + bdErr.substring(0, 200) });
          return;
        }

        console.log('[Baidu bg] connected, status:', bdRes.status);
        var bdRd = bdRes.body.getReader();
        var bdDec = new TextDecoder();
        var totalBd = 0;
        while (true) {
          var bdC = await bdRd.read();
          if (bdC.done) break;
          var chunkText = bdDec.decode(bdC.value, { stream: true });
          totalBd += chunkText.length;
          if (totalBd <= 5000 && chunkText.length > 0) console.log('[Baidu bg] chunk:', chunkText.substring(0, 500));
          p.postMessage({ type: 'chunk', text: chunkText });
        }
        console.log('[Baidu bg] stream done, total bytes:', totalBd);
        p.postMessage({ type: 'done' });
      } catch (e) {
        try { p.postMessage({
          type: 'error',
          error: e.name === 'AbortError' ? 'Aborted' : e.message
        }); } catch(ex) {}
      }
    });

    p.onDisconnect.addListener(function() {
      if (bdAc) { bdAc.abort(); bdAc = null; }
    });
  }

  if (p.name === 'browser-panel') {
    var bp = { context: null, executor: null };

    function setFloatingBtn(show) {
      chrome.tabs.query({}, function(tabs) {
        var display = show ? 'flex' : 'none';
        for (var i = 0; i < tabs.length; i++) {
          if (tabs[i].id && tabs[i].url && tabs[i].url.startsWith('http')) {
            chrome.scripting.executeScript({
              target: { tabId: tabs[i].id },
              func: function(d) { var b = document.getElementById('ai-chat-floating-btn'); if (b) b.style.display = d; },
              args: [display],
            }).catch(function(){});
          }
        }
      });
    }

    function setHighlightVisibility(show) {
      (async function() {
        try {
          var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tabs[0] && tabs[0].id) {
            await chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: function(s) { var c = document.getElementById('playwright-highlight-container'); if (c) c.style.display = s ? 'block' : 'none'; },
              args: [show],
            });
          }
        } catch(e) {}
        try { p.postMessage({ type: 'highlightState', on: show }); } catch(e) {}
      })();
    }

    p.onMessage.addListener(async function(m) {
      if (m.type === 'new_task') {
        try {
          // Cancel old executor before cleaning up context
          if (bp.executor) { try { bp.executor.cancel(); } catch(e){} try { bp.executor.clearExecutionEvents(); } catch(e){} }
          if (bp.context) { try { await bp.context.cleanup(); } catch(e){} }
          var data = await chrome.storage.local.get('aiSettings');
          var s = data.aiSettings || {};
          var visionOn = !!s.browserUseVision;
          var bc = new BrowserAgent.BrowserContext({ displayHighlights: visionOn });
          bp.context = bc;
          bp.highlightsOn = visionOn;
          if (m.url) await bc.navigateTo(m.url); else await bc.getCurrentPage();
          var llm = BrowserAgent.createChatModel(
            { provider: s.provider || 'openai', apiKey: s.apiKey || '', baseUrl: s.baseUrl || '' },
            { modelName: s.model || 'gpt-4o', provider: s.provider || 'openai', parameters: { temperature: s.temperature || 0.1, topP: 0.1 } }
          );
          var ex = new BrowserAgent.Executor(m.instruction, 'bp_' + Date.now(), bc, llm, { agentOptions: { maxSteps: 50, planningInterval: 1, useVision: visionOn, useVisionForPlanner: false } });
          bp.executor = ex;
          setFloatingBtn(false);
          setHighlightVisibility(visionOn);
          ex.subscribeExecutionEvents(async function(ev) {
            try {
              var scr = null;
              if (ev.state === 'step.start' || ev.state === 'act.start') { try { var st = await bc.getState(); scr = st.screenshot; } catch(e){} }
              p.postMessage({ type: 'event', state: ev.state, details: ev.data.details, step: ev.data.step, maxSteps: ev.data.maxSteps, screenshot: scr });
            } catch(e){}
          });
          (function(myEx) {
            myEx.execute().then(function() { myEx.clearExecutionEvents(); setFloatingBtn(true); setHighlightVisibility(false); try { p.postMessage({ type: 'done' }); } catch(e){} }).catch(function(err) { setFloatingBtn(true); setHighlightVisibility(false); try { p.postMessage({ type: 'error', error: err.message }); } catch(e){} });
          })(ex);
          try { p.postMessage({ type: 'event', state: 'task.start', details: '\u5F00\u59CB\u6267\u884C\u6D4F\u89C8\u5668\u4EFB\u52A1...' }); } catch(e){}
        } catch(e) { setFloatingBtn(true); try { p.postMessage({ type: 'error', error: e.message }); } catch(ex){} }
      } else if (m.type === 'stop') {
        if (bp.executor) bp.executor.cancel();
        if (bp.context) { try { bp.context.cleanup(); } catch(e){} }
        setFloatingBtn(true);
        setHighlightVisibility(false);
      } else if (m.type === 'pause') {
        if (bp.executor) bp.executor.pause();
        try { p.postMessage({ type: 'event', state: 'task.pause' }); } catch(e){}
      } else if (m.type === 'resume') {
        if (bp.executor) bp.executor.resume();
        try { p.postMessage({ type: 'event', state: 'task.resume' }); } catch(e){}
      } else if (m.type === 'screenshot') {
        (async function() {
          try { if (bp.context) { var st = await bp.context.getState(); if (st.screenshot) p.postMessage({ type: 'screenshot', dataUrl: st.screenshot }); } } catch(e){}
        })();
        return true;
      } else if (m.type === 'toggleHighlight') {
        bp.highlightsOn = !bp.highlightsOn;
        setHighlightVisibility(bp.highlightsOn);
        return true;
      }
    });

    p.onDisconnect.addListener(function() {
      if (bp.executor) { try { bp.executor.cancel(); } catch(e){} try { bp.executor.clearExecutionEvents(); } catch(e){} }
      if (bp.context) { try { bp.context.cleanup(); } catch(e){} }
      setFloatingBtn(true);
      bp = { context: null, executor: null };
    });
  }
});

async function captureFullPageScreenshot(tab) {
  var tabId = tab.id, dims, hidden = [];

  try {
    var r = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function() {
        var d = document.documentElement, b = document.body;
        return {
          w: Math.max(d.scrollWidth, b ? b.scrollWidth : 0, d.clientWidth),
          h: Math.max(d.scrollHeight, b ? b.scrollHeight : 0, d.clientHeight)
        };
      }
    });
    dims = r[0].result;
    if (!dims || dims.w < 1 || dims.h < 1) throw new Error('页面尺寸无效');
  } catch (e) {
    console.log('[captureFullPage] 获取页面尺寸失败:', e.message);
    return;
  }

  // 隐藏插件自身 UI 元素（侧边栏、悬浮按钮等）
  try {
    var h = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function() {
        var restore = [];
        var elts = document.querySelectorAll(
          '[id^="ai-chat-"], [id^="hupilot-"], [id^="__ai-"], #playwright-highlight-container'
        );
        elts.forEach(function(el) {
          if (el.style.display !== 'none') {
            restore.push({ id: el.id, orig: el.style.display || '' });
            el.style.display = 'none';
          }
        });
        return restore;
      }
    });
    hidden = h[0].result || [];
  } catch (e) {}

  var dg = { tabId: tabId };
  try { await chrome.debugger.attach(dg, '1.3'); }
  catch (e) {
    try { await chrome.debugger.detach(dg); } catch (ex) {}
    await chrome.debugger.attach(dg, '1.3');
  }

  try {
    await chrome.debugger.sendCommand(dg, 'Emulation.setDeviceMetricsOverride', {
      width: Math.ceil(dims.w),
      height: Math.ceil(dims.h),
      deviceScaleFactor: 1,
      mobile: false
    });
    await new Promise(function(r) { setTimeout(r, 200); });

    var cap = await chrome.debugger.sendCommand(dg, 'Page.captureScreenshot', {
      format: 'png'
    });

    await chrome.debugger.sendCommand(dg, 'Emulation.clearDeviceMetricsOverride');

    var name = (tab.title || tab.url || 'page').replace(/[/\\?%*:|"<>]/g, '_').substring(0, 100);
    var fname = name + '-fullpage.png';

    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: 'MAIN',
      func: function(b64, fn) {
        var bin = atob(b64), n = bin.length, bytes = new Uint8Array(n);
        for (var i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i);
        var blob = new Blob([bytes], { type: 'image/png' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = fn;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
      },
      args: [cap.data, fname]
    });
  } catch (e) {
    console.log('[captureFullPage] 截图失败:', e.message);
  } finally {
    try { await chrome.debugger.detach(dg); } catch (e) {}
    // 恢复插件 UI 元素
    if (hidden.length > 0) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: function(restore) {
            restore.forEach(function(item) {
              var el = document.getElementById(item.id);
              if (el) el.style.display = item.orig || '';
            });
          },
          args: [hidden]
        });
      } catch (e) {}
    }
  }
}

// === Bilibili 字幕获取（WBI 签名 + API 调用） ===

// 正确的 MD5 实现（RFC 1321）
function md5(s) {
  return CryptoJS.MD5(s).toString();
}

// WBI 签名
function wbiSign(params, imgKey, subKey) {
  var mixKeyTab=[46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
  var mixKey=mixKeyTab.map(function(n){return(imgKey+subKey)[n]}).join('').slice(0,32);
  var now=Math.round(Date.now()/1000);
  params.wts=now;
  var keys=Object.keys(params).sort();
  var q=keys.map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(String(params[k]))}).join('&');
  var wrid=md5(q+mixKey);
  return q+'&w_rid='+wrid;
}

// 获取字幕
async function bilibiliFetchSubtitle(opts) {
  var q=wbiSign({aid:opts.aid,cid:opts.cid,dm_img_list:'[]',dm_img_str:opts.dmImgStr||'bm8gd2ViZ2',dm_cover_img_str:opts.dmCoverImgStr||'bm8gd2ViZ2wgZXh0ZW5zaW'},opts.imgKey,opts.subKey);
  var url='https://api.bilibili.com/x/player/wbi/v2?'+q;
  var res=await fetch(url,{credentials:'omit'});
  var txt=await res.text();
  var body;
  try{body=JSON.parse(txt)}catch(e){return{error:'not_json',text:txt.substring(0,200)}}
  if(body.code!==0)return{error:'api_err',code:body.code,msg:body.message}
  var subs=body.data&&body.data.subtitle;
  if(!subs||!subs.subtitles||!subs.subtitles.length)return{error:'no_subtitles',rawSubs:subs,rawSample:JSON.stringify(body.data).substring(0,500)}
  var list=[];
  for(var i=0;i<subs.subtitles.length;i++){
    var sub=subs.subtitles[i];
    var subUrl=sub.subtitle_url;
    if(!subUrl)continue;
    if(subUrl.startsWith('//'))subUrl='https:'+subUrl;
    try{
      var subRes=await fetch(subUrl);
      var subData=await subRes.json();
      var segments=(subData.body||[]).map(function(s){return{from:s.from,to:s.to,text:s.content}});
      list.push({lan:sub.lan,lan_doc:sub.lan_doc,segments:segments,total:segments.length});
    }catch(e){
      list.push({lan:sub.lan,lan_doc:sub.lan_doc,error:e.message});
    }
  }
  return{aid:opts.aid,cid:opts.cid,subtitles:list};
}
