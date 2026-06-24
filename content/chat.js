(function() {
  if (document.getElementById('ai-chat-sidebar')) return;

  var sidebar, messagesEl, inputEl, sendBtn, welcomeEl;
  var chatView, sessionView, settingsView, sessionListEl, headerTitle, quickActionsEl;
  var sessionEditMode = false;
  var webQaMode = false;
  var currentAbortController = null;
  var isStreaming = false;
  var sidebarWidth = 0;
  var optimizer = null;
  var pageContentCache = null;
  var sidebarOpen = false;
  var pollTimer = null;
  var pendingPageInject = false;
  var floatingBtn = null, petAnimator = null, petAnimMode = false, moveAnim = null;
  var isHtmlFile = false;
  var expWebEditEnabled = false;
  var expPageTranslationEnabled = false;
  var browserControlEnabled = false;
  var htmlEditMode = false;
  var editorInjected = false;
  var originalRefreshFn = null;
  var originalSaveMdFn = null;
  var floatState = null;
  var floatDragData = null;
  var mobileSheetState = 50;
  var isMobileMode = false;

  // Page translation state (cached from injected PageTranslator)
  var ptState = 'idle'; // idle | translating | translated
  var ptProgress = { done: 0, total: 0 };
  var ptHasCache = false;
  var ptStatusEl = null;

  function init() {
    optimizer = getOptimizer(window.location.href);
    isHtmlFile = location.protocol === 'file:' && /\.html?$/i.test(location.pathname);
    createSidebarDOM();
    createFloatingBtn();
    createSelectionPopup();
    initSleepMode();
    initReminderTimer();
    sidebarWidth = Math.min(480, Math.round(window.innerWidth * 0.3));
    initResizeHandle();
    chrome.runtime.onMessage.addListener(function(msg) {
      if (msg.type === 'toggleSidebar') toggleSidebar();
      if (msg.type === 'editorModeToggle') { if (window.__htmlEditor) toggleEditorMode(); }
    });
    document.addEventListener('aiChatToggle', toggleSidebar);
    document.addEventListener('aiChatOpenSettings', function() { openSidebar(); showSettingsView(); });
    document.addEventListener('aiChatTranslatePage', function() {
      readAISettings().then(function(s) {
        if (s.pageTranslation === true) togglePageTranslation();
      });
    });
    document.addEventListener('aiChatResetDeskPet', resetDeskPetPosition);

    window.addEventListener('popstate', handleUrlChange);
    injectTTSScript();
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === '__TTS_END') {
        if (typeof _ttsEndListener === 'function') {
          var fn = _ttsEndListener;
          _ttsEndListener = null;
          fn();
        } else {
          ttsSpeaking = false;
          resetAllTtsBtns();
        }
      }
    });
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'biliSubtitleReady') showBiliToast('虎宝已读取视频');
    });
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'ytSubtitleReady') showBiliToast('虎宝已读取视频');
    });
    readAISettings().then(function(s) {
      expWebEditEnabled = s.experimentalWebEdit === true;
      try { localStorage.setItem('hupilot_exp_web_edit', expWebEditEnabled ? '1' : '0'); } catch(e) {}
      if (expWebEditEnabled || isHtmlFile) {
        var editBtn = document.getElementById('ai-chat-html-edit-btn');
        if (editBtn) editBtn.style.display = '';
      }
      expPageTranslationEnabled = s.pageTranslation === true;
      var transBtn = document.getElementById('ai-chat-translate-btn');
if (transBtn) transBtn.style.display = expPageTranslationEnabled ? '' : 'none';
      browserControlEnabled = s.browserControl === true;
      var browserBtn = document.getElementById('ai-chat-browser-btn');
      if (browserBtn) browserBtn.style.display = browserControlEnabled ? '' : 'none';
      shellMasterEnabled = s.shellHostEnabled === true;
      var shellBtn = document.getElementById('ai-chat-shell-toggle');
      if (shellBtn) shellBtn.style.display = shellMasterEnabled ? '' : 'none';
      if (shellMasterEnabled) loadSkillList();
      var subBtn = document.getElementById('ai-chat-bili-subtitle-btn');
      if (subBtn) subBtn.style.display = (/bilibili\.com\/video\//.test(window.location.href)) ? '' : 'none';
      var ytSubBtn = document.getElementById('ai-chat-yt-subtitle-btn');
      if (ytSubBtn) ytSubBtn.style.display = (/youtube\.com/.test(window.location.href)) ? '' : 'none';
      if (s.deskPetAlways === true && floatingBtn) {
        floatingBtn.style.display = 'flex';
        startFloatingTimer();
      }
      applyPetBtnSize(s.petSize || 'large');
      // Mobile mode init
      if (s.mobileMode === true) {
        applyMobileMode(true);
      } else {
        // First-time detection: only run once
        var _mobileChecked = false;
        try { _mobileChecked = localStorage.getItem('hupilot_mobile_checked') === '1'; } catch(e) {}
        if (!_mobileChecked) {
        try { localStorage.setItem('hupilot_mobile_checked', '1'); } catch(e) {}
        if (/Mobile|Android|iPhone|iPad/i.test(navigator.userAgent) && 'ontouchstart' in window) {
          setTimeout(function() {
            if (confirm('检测到您目前使用的是手机，是否开启手机模式？')) {
              applyMobileMode(true);
              // Also persist to settings so it stays on
              readAISettings().then(function(cur) {
                cur.mobileMode = true;
                saveAISettings(cur);
                var mmCb = document.getElementById('ai-chat-settings-mobile-mode');
                if (mmCb) mmCb.checked = true;
              });
            }
          }, 1000);
        }
      }
      }
      if (isMobileMode && floatingBtn && floatingBtn.style.display !== 'flex') {
        floatingBtn.style.display = 'flex';
        startFloatingTimer();
      }
    }).catch(function() {});
    document.addEventListener('htmlEditorReady', function() {
      editorInjected = true;
    });
  }

  // === Sidebar DOM ===
  function createSidebarDOM() {
    sidebar = document.createElement('div');
    sidebar.id = 'ai-chat-sidebar';
sidebar.innerHTML =
      '<div id="ai-chat-drag-handle"></div>' +
      '<div id="ai-chat-header">' +
'<button id="ai-chat-view-toggle" title="会话管理"><svg viewBox="0 0 20 20" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></svg></button>' +
        '<h2 id="ai-chat-header-title">Hupilot</h2>' +
        '<div id="ai-chat-header-actions">' +
            '<button id="ai-chat-refresh-btn" class="hdr-ordinary" title="重新读取页面内容"><svg viewBox="0 0 20 20" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M17 10a7 7 0 0 1-14 0 7 7 0 0 1 7-7c2.5 0 4.2 1.3 5.5 2.8"/><polyline points="18 2 18 6 14 6"/></svg></button>' +
            '<button id="ai-chat-unlock-btn" class="hdr-ordinary" title="解除右键及复制限制"><svg viewBox="0 0 20 20" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><rect x="5" y="10" width="10" height="7" rx="1"/><path d="M6 10V7c0-2 1-3.5 4-3.5 1.5 0 2.5.5 3 1.5"/><line x1="10" y1="12" x2="10" y2="14"/></svg></button>' +
            '<button id="ai-chat-html-edit-btn" class="hdr-ordinary" title="HTML 编辑模式" style="display:none"><svg viewBox="0 0 20 20" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><rect x="3" y="2" width="14" height="16" rx="2"/><line x1="6" y1="8" x2="14" y2="8"/><line x1="6" y1="11" x2="14" y2="11"/><line x1="6" y1="14" x2="11" y2="14"/></svg></button>' +
           '<button id="ai-chat-save-md-btn" class="hdr-ordinary" title="当前网页保存为md文件"><svg viewBox="0 0 20 20" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M4 3h8.5L17 7.5V16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><rect x="7" y="11" width="6" height="6" rx="1"/></svg></button>' +
            '<button id="ai-chat-translate-btn" class="hdr-ordinary" title="翻译页面" style="display:none"><svg viewBox="0 0 22 22" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round"><circle cx="11" cy="11" r="8.5"/><path d="M3 11h16"/><path d="M11 2.5A12.5 12.5 0 0 1 14 11a12.5 12.5 0 0 1-3 8.5"/><path d="M11 2.5A12.5 12.5 0 0 0 8 11a12.5 12.5 0 0 0 3 8.5"/></svg></button>' +
            '<button id="ai-chat-clear-btn" class="hdr-ordinary" title="清空聊天记录"><svg viewBox="0 0 20 20" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><polyline points="3 5 5 5 17 5"/><path d="M6 5V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M8 9v6"/><path d="M12 9v6"/><path d="M4 5l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12"/></svg></button>' +
            '<button id="ai-chat-export-btn" class="hdr-ordinary" title="导出对话"><svg viewBox="0 0 20 20" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M10 3v9"/><path d="M6 7l4-4 4 4"/><path d="M4 13v3a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3"/></svg></button>' +
            '<button id="ai-chat-settings-btn" class="hdr-ordinary" title="设置"><svg viewBox="0 0 20 20" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><circle cx="4" cy="10" r="1.5" fill="currentColor"/><line x1="5.5" y1="10" x2="17" y2="10"/><circle cx="16" cy="5" r="1.5" fill="currentColor"/><line x1="3" y1="5" x2="14.5" y2="5"/><circle cx="16" cy="15" r="1.5" fill="currentColor"/><line x1="3" y1="15" x2="14.5" y2="15"/></svg></button>' +
            '<button id="ai-chat-header-save-btn" title="保存设置"><svg viewBox="0 0 20 20" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M4 3h8.5L17 7.5V16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><polyline points="9 11 11 13 15 9"/></svg></button>' +
            '<button id="ai-chat-minimize-btn" title="最小化"><svg viewBox="0 0 20 20" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><line x1="3" y1="16" x2="17" y2="16"/><polyline points="5 9 10 14 15 9"/></svg></button>' +
           '<button id="ai-chat-float-btn" title="切换浮动窗口"><svg viewBox="0 0 20 20" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><rect x="2" y="3" width="16" height="14" rx="2"/><path d="M2 7h16"/></svg></button>' +
           '<button id="ai-chat-close-btn" title="关闭"><svg viewBox="0 0 20 20" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><line x1="4" y1="4" x2="16" y2="16"/><line x1="16" y1="4" x2="4" y2="16"/></svg></button>' +
        '</div>' +
      '</div>' +

      // Chat view
      '<div id="ai-chat-view">' +
        '<div id="ai-chat-messages">' +
          '<div id="ai-chat-welcome">' +
            '<div class="welcome-icon"><img src="' + chrome.runtime.getURL('icons/hupilot.png') + '" alt="Hupilot" /></div>' +
            '<p id="ai-chat-welcome-text">我是虎宝，快和我说话吧。</p>' +
            '<p id="ai-chat-welcome-hint" class="hint">输入问题开始对话</p>' +
          '</div>' +
        '</div>' +
        '<div id="ai-chat-input-area">' +
          '<div id="ai-chat-quick-actions"></div>' +
           '<div id="ai-chat-search-bar">' +
            '<button id="ai-chat-search-toggle" class="ai-chat-search-off" title="联网搜索开关">' +
              '<svg viewBox="0 0.8 16 15.2" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round"><circle cx="7" cy="7" r="4.5"/><line x1="10.5" y1="10.5" x2="14.5" y2="14.5"/></svg>' +
            '</button>' +
            '<select id="ai-chat-search-provider" title="选择搜索引擎" style="display:none">' +
              '<option value="anysearch">AnySearch(推荐)</option>' +
              '<option value="baidu-dom">百度网页版</option>' +
              '<option value="baidu-hp">百度(高性能)</option>' +
              '<option value="baidu-standard">百度(标准)</option>' +
              '<option value="tavily">Tavily</option>' +
            '</select>' +
            '<button id="ai-chat-shell-toggle" class="ai-chat-shell-off" title="开启后可执行命令及读写本地文件" style="display:none"><svg viewBox="0 0 16 16" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;transform:translateY(1px)"><rect x="2" y="1" width="12" height="9" rx="1"/><line x1="5" y1="13" x2="11" y2="13"/><line x1="8" y1="10" x2="8" y2="13"/></svg></button>' +
            '<button id="ai-chat-webqa-btn" title="此模式下不识别当前网页内容">联网问答模式</button>' +
'<button id="ai-chat-browser-btn" title="通过 AI 操控此页面" style="display:none">浏览器操控</button>' +
'<button id="ai-chat-bili-subtitle-btn" title="下载 B 站视频字幕" style="display:none">下载字幕</button>' +
'<button id="ai-chat-yt-subtitle-btn" title="下载 YouTube 视频字幕" style="display:none">下载字幕</button>' +
          '</div>' +
          '<div id="ai-chat-input-row">' +
            '<textarea id="ai-chat-input" rows="1" placeholder="输入消息..."></textarea>' +
            '<button id="ai-chat-send-btn" title="发送"><svg viewBox="0 0 16 16" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><polygon points="2 2 14 8 2 14 4.5 8 2 2"/></svg></button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Session list view
      '<div id="ai-chat-session-view">' +
        '<div id="ai-chat-session-top-bar">' +
          '<button id="ai-chat-session-edit-btn">编辑</button>' +
          '<div id="ai-chat-session-batch-bar" class="hidden">' +
            '<button id="ai-chat-session-select-all">全选</button>' +
            '<button id="ai-chat-session-delete-selected" class="danger">删除</button>' +
          '</div>' +
        '</div>' +
        '<div id="ai-chat-session-list"></div>' +
        '<button id="ai-chat-new-session">+ 新建会话</button>' +
      '</div>' +

      // Settings view
      '<div id="ai-chat-settings-view">' +
        '<div id="ai-chat-settings-nav"><ul>' +
          '<li data-target="settings-heading-provider">AI 提供商</li>' +
          '<li data-target="settings-heading-mobile">手机模式</li>' +
          '<li data-target="settings-heading-dialogue">对话设置</li>' +
          '<li data-target="settings-heading-deskpet">桌宠设置</li>' +
          '<li data-target="settings-heading-sleep">睡眠模式</li>' +
          '<li data-target="settings-heading-outlook">Outlook</li>' +
          '<li data-target="settings-heading-translate">翻译</li>' +
          '<li data-target="settings-heading-display">显示</li>' +
          '<li data-target="settings-heading-tts">语音</li>' +
          '<li data-target="settings-heading-search">联网搜索</li>' +
          '<li data-target="settings-heading-popup">AI浮窗</li>' +
          
          '<li data-target="settings-heading-reminders">定时提醒</li>' +
          '<li data-target="settings-heading-experimental">实验功能</li>' +
          '<li style="margin-top:8px;border-top:1px solid #e0e0e0;padding-top:8px"><a href="https://hubao.huidezh.dpdns.org/sponsor" target="_blank" style="color:#607cd2;text-decoration:none">赞助支持</a></li>' +
        '</ul></div>' +
        '<div class="ai-chat-settings-scroll">' +
          '<div class="ai-chat-settings-section">' +
            '<h4 id="settings-heading-provider">AI 提供商</h4>' +
            '<div class="ai-chat-settings-row">' +
              '<label>提供商</label>' +
              '<select id="ai-chat-settings-provider"></select>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label>API 地址</label>' +
              '<input type="text" id="ai-chat-settings-baseurl" placeholder="https://api.deepseek.com/v1">' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label>模型</label>' +
              '<select id="ai-chat-settings-model"></select>' +
              '<input type="text" id="ai-chat-settings-model-custom" placeholder="自定义模型名" style="display:none">' +
              '<a href="#" id="ai-chat-settings-model-back" style="display:none">← 返回预设</a>' +
            '</div>' +
            '<div id="ai-chat-settings-apikey-rows"></div>' +
'</div>' +
           '<div class="ai-chat-settings-section">' +
             '<h4 id="settings-heading-mobile">手机模式</h4>' +
             '<div class="ai-chat-settings-row">' +
               '<label><input type="checkbox" id="ai-chat-settings-mobile-mode"> 手机模式（针对手机交互进行优化，桌面端请勿开启）</label>' +
             '</div>' +
           '</div>' +
           '<div class="ai-chat-settings-section">' +
             '<h4 id="settings-heading-dialogue">对话设置</h4>' +
            '<div class="ai-chat-settings-row">' +
              '<label>系统提示词</label>' +
'<textarea id="ai-chat-settings-prompt" rows="2" placeholder="你的名字叫虎宝，你是一只可爱的小老虎"></textarea>' +
'<button class="ai-chat-reset-prompt" data-target="ai-chat-settings-prompt" data-default="你的名字叫虎宝，你是一只可爱的小老虎">恢复默认</button>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label>上下文轮次（给AI的上下文会话轮次最大值）</label>' +
              '<input type="number" id="ai-chat-settings-history" min="0" max="50" value="8">' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label>历史会话保留数</label>' +
              '<input type="number" id="ai-chat-settings-max-sessions" min="1" max="200" value="50">' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label>页面内容最大字符数</label>' +
              '<input type="number" id="ai-chat-settings-content-limit" min="1000" max="200000" step="1000" value="100000">' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label><input type="checkbox" id="ai-chat-settings-thinking"> 启用思考模式</label>' +
            '</div>' +
            '<div class="ai-chat-settings-row" id="ai-chat-settings-reasoning-group" style="display:none">' +
              '<label>推理强度</label>' +
              '<select id="ai-chat-settings-reasoning">' +
                '<option value="low">低</option>' +
                '<option value="medium">中</option>' +
                '<option value="high">高</option>' +
              '</select>' +
            '</div>' +
            '<div class="ai-chat-settings-row ai-chat-actions-header">快捷按钮</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label><input type="checkbox" id="ai-chat-settings-action-default_summary"> 总结页面</label>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label><input type="checkbox" id="ai-chat-settings-action-default_translate"> 翻译</label>' +
            '</div>' +
            '<div class="ai-chat-actions-header">自定义快捷指令</div>' +
            '<div id="ai-chat-settings-quick-actions-list"></div>' +
            '<button id="ai-chat-settings-add-quick-action" class="ai-chat-settings-btn">+ 添加快捷指令</button>' +
          '</div>' +
          '<div class="ai-chat-settings-section">' +
            '<h4 id="settings-heading-deskpet">桌宠设置</h4>' +
            '<div class="ai-chat-settings-row">' +
              '<label><input type="checkbox" id="ai-chat-settings-deskpet"> 桌宠是否一直显示</label>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label>桌宠显示文字（每行一句）</label>' +
              '<textarea id="ai-chat-settings-deskpet-texts" rows="3" placeholder="每行一句话"></textarea>' +
              '<button class="ai-chat-reset-prompt" data-target="ai-chat-settings-deskpet-texts" data-default="我饿了\n休息一下吧\n陪我玩一会儿\n工作辛苦了\n下午茶时间\n散步时间\n我要吃肉！\n我是一只小老虎\n嗷呜~嗷呜~">恢复默认</button>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label>文字切换间隔（分钟）</label>' +
              '<input type="number" id="ai-chat-settings-deskpet-interval" min="1" max="999" value="2">' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label>文字显示时长（秒）</label>' +
               '<input type="number" id="ai-chat-settings-deskpet-duration" min="1" max="999" value="5">' +
             '</div>' +
             '<div class="ai-chat-settings-row">' +
               '<label>桌宠大小</label>' +
               '<div class="ai-chat-settings-radio-group">' +
                 '<label><input type="radio" name="petSize" value="large" checked> 大</label>' +
                 '<label><input type="radio" name="petSize" value="medium"> 中</label>' +
                 '<label><input type="radio" name="petSize" value="small"> 小</label>' +
               '</div>' +
             '</div>' +
'</div>' +
           '<div class="ai-chat-settings-section">' +
             '<h4 id="settings-heading-sleep">睡眠模式</h4>' +
            '<div class="ai-chat-settings-row">' +
              '<label>无操作超时（分钟，0=关闭）</label>' +
              '<input type="number" id="ai-chat-settings-sleep-timeout" min="0" max="999" value="3">' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label>睡眠时显示文字（每行一句）</label>' +
              '<textarea id="ai-chat-settings-sleep-texts" rows="3" placeholder="每行一句话"></textarea>' +
              '<button class="ai-chat-reset-prompt" data-target="ai-chat-settings-sleep-texts" data-default="好多肉\n真好吃\nz  z  z\n吃不下了\n再睡一会儿">恢复默认</button>' +
            '</div>' +
          '</div>' +
          '<div class="ai-chat-settings-section">' +
            '<h4 id="settings-heading-outlook">Outlook</h4>' +
            '<div class="ai-chat-settings-row">' +
              '<label>Outlook 系统提示词</label>' +
              '<textarea id="ai-chat-settings-outlook-prompt" rows="3" placeholder="你的名字叫虎宝，你是一个邮件助手，可以帮助用户处理邮件，并给用户提供管理上的帮助和支持。请基于邮件内容给出准确、专业的回答，并给出管理视角的专业建议和提醒。"></textarea>' +
'<button class="ai-chat-reset-prompt" data-target="ai-chat-settings-outlook-prompt" data-default="你的名字叫虎宝，你是一个邮件助手，可以帮助用户处理邮件，并给用户提供管理上的帮助和支持。请基于邮件内容给出准确、专业的回答，并给出管理视角的专业建议和提醒。">恢复默认</button>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label>用户信息 <span style="color:red;font-weight:bold">*</span></label>' +
              '<textarea id="ai-chat-settings-outlook-userinfo" rows="3" placeholder="例如：&#10;姓名，邮箱地址，职位，性别"></textarea>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label>快速回复提示词</label>' +
              '<textarea id="ai-chat-settings-outlook-reply-prompt" rows="3" placeholder="你的名字叫虎宝，你是一个邮件助手。请基于邮件内容给出准确、专业的回答。不要使用markdown格式，直接输出纯文本。"></textarea>' +
'<button class="ai-chat-reset-prompt" data-target="ai-chat-settings-outlook-reply-prompt" data-default="你的名字叫虎宝，你是一个邮件助手。请基于邮件内容给出准确、专业的回答。不要使用markdown格式，直接输出纯文本。">恢复默认</button>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label><input type="checkbox" id="ai-chat-settings-outlook-reply-btn"> 是否显示快速回复按钮</label>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label><input type="checkbox" id="ai-chat-settings-outlook-reply-plus-btn"> 是否显示快速回复+按钮</label>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label><input type="checkbox" id="ai-chat-settings-outlook-reply-cc" checked> 回复时给虎宝抄送人信息</label>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label><input type="checkbox" id="ai-chat-settings-outlook-reply-bcc"> 回复时给虎宝密抄人信息</label>' +
            '</div>' +
            '<div class="ai-chat-settings-row ai-chat-actions-header">快捷按钮</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label><input type="checkbox" id="ai-chat-settings-action-outlook_summary"> 总结</label>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label><input type="checkbox" id="ai-chat-settings-action-outlook_reply"> 回复</label>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label><input type="checkbox" id="ai-chat-settings-action-outlook_keypoints"> 要点</label>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label><input type="checkbox" id="ai-chat-settings-action-outlook_translate"> 翻译</label>' +
            '</div>' +
          '</div>' +
          '<div class="ai-chat-settings-section">' +
            '<h4 id="settings-heading-translate">翻译</h4>' +
            '<div class="ai-chat-settings-row">' +
              '<label>默认翻译语言</label>' +
              '<select id="ai-chat-settings-lang"></select>' +
              '<input type="text" id="ai-chat-settings-lang-custom" placeholder="自定义语言" style="display:none">' +
              '<a href="#" id="ai-chat-settings-lang-back" style="display:none">← 返回预设</a>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label><input type="checkbox" id="ai-chat-settings-exp-page-translate"> AI网页翻译功能是否开启</label>' +
            '</div>' +
            '<div class="ai-chat-settings-row" id="ai-chat-settings-bilingual-row" style="display:none">' +
              '<label><input type="checkbox" id="ai-chat-settings-page-bilingual"> 双语显示（原文+译文）</label>' +
            '</div>' +
            '<div class="ai-chat-settings-row" id="ai-chat-settings-bilingual-style-row" style="display:none">' +
              '<label>译文样式</label>' +
              '<select id="ai-chat-settings-bilingual-style">' +
'<option value="default">默认无装饰</option>' +
                '<option value="blockquote">引用线</option>' +
                '<option value="weakened">灰色弱化</option>' +
                '<option value="dashedLine">虚线下划线</option>' +
                '<option value="border">边框圆角</option>' +
                '<option value="textColor">紫色文字</option>' +
                '<option value="background">半透明背景</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="ai-chat-settings-section">' +
            '<h4 id="settings-heading-display">显示</h4>' +
            '<div class="ai-chat-settings-row">' +
              '<label>深色模式</label>' +
              '<select id="ai-chat-settings-darkmode">' +
                '<option value="system">跟随系统</option>' +
                '<option value="on">开启</option>' +
                '<option value="off">关闭</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="ai-chat-settings-section">' +
            '<h4 id="settings-heading-tts">语音</h4>' +
            '<div class="ai-chat-settings-row">' +
              '<label><input type="checkbox" id="ai-chat-settings-tts-enabled"> 启用语音朗读</label>' +
            '</div>' +
            '<div class="ai-chat-settings-row" id="ai-chat-settings-tts-voice-row" style="display:none">' +
              '<label>语音</label>' +
              '<select id="ai-chat-settings-tts-voice"></select>' +
              '<input type="text" id="ai-chat-settings-tts-voice-custom" placeholder="例如：zh-CN-XiaoshuangNeural" style="display:none">' +
              '<div style="display:flex;align-items:center;justify-content:space-between">' +
                '<a href="#" id="ai-chat-settings-tts-voice-back" style="display:none">← 返回预设</a>' +
                '<span id="ai-chat-settings-tts-engine-links" style="display:none">' +
                  '<a href="https://tts.travisvn.com/" target="_blank" rel="noopener noreferrer">默认引擎</a> ' +
                  '<a href="https://learn.microsoft.com/zh-cn/azure/ai-services/speech-service/language-support?tabs=tts#multilingual-voices" target="_blank" rel="noopener noreferrer">增强引擎</a>' +
                '</span>' +
              '</div>' +
            '</div>' +
            '<div class="ai-chat-settings-row tts-rate-row" id="ai-chat-settings-tts-rate-row" style="display:none">' +
              '<label>语速</label>' +
              '<div class="tts-range-group">' +
                '<input type="range" id="ai-chat-settings-tts-rate" min="0.5" max="2.0" step="0.05" value="1.0">' +
                '<input type="number" id="ai-chat-settings-tts-rate-val" min="0.5" max="2.0" step="0.05" value="1.0">' +
              '</div>' +
            '</div>' +
            '<div class="ai-chat-settings-row tts-hint" id="ai-chat-settings-tts-hint" style="display:none">' +
               '<span class="tts-hint-text">提示：以上语音设置，默认只对Edge浏览器有效，其他浏览器在开启下方语音增强功能时才生效。</span>' +
             '</div>' +
             '<div class="ai-chat-settings-row">' +
                '<label><input type="checkbox" id="ai-chat-settings-tts-edge-direct"> 语音增强（如语音播放功能不正常，请关闭此功能）</label>' +
             '</div>' +
           '</div>' +
          '<div class="ai-chat-settings-section">' +
            '<h4 id="settings-heading-search">联网搜索</h4>' +
            '<div class="ai-chat-settings-row">' +
              '<label>搜索引擎</label>' +
              '<select id="ai-chat-settings-search-provider">' +
                '<option value="anysearch">AnySearch（推荐）</option>' +
                '<option value="baidu-dom">百度网页版</option>' +
                '<option value="baidu-standard">百度智能搜索生成（标准版）</option>' +
                '<option value="baidu-hp">百度智能搜索生成（高性能版）</option>' +
                '<option value="tavily">Tavily</option>' +
              '</select>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label>联网问答提示词</label>' +
              '<textarea id="ai-chat-settings-webqa-prompt" rows="3" placeholder="你的名字叫虎宝，你是一个专业的联网问答助手..."></textarea>' +
              '<button class="ai-chat-reset-prompt" data-target="ai-chat-settings-webqa-prompt" data-default="你的名字叫虎宝，你是一个专业的联网问答助手。你可以通过搜索工具联网获取最新信息来回答用户的问题。请充分利用搜索工具查询实时信息，并基于搜索结果给出全面、准确、结构化的回答。如果搜索结果不足以回答问题，请如实告知用户。不要编造信息，所有回答必须基于搜索结果。">恢复默认</button>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label>百度 API Key <a href="https://console.bce.baidu.com/ai-search/qianfan/ais/console/apiKey" target="_blank" style="margin-left:4px">获取</a></label>' +
              '<div class="ai-chat-settings-key-row">' +
                '<input type="password" id="ai-chat-settings-baidu-key" autocomplete="new-password" placeholder="输入百度千帆 API Key">' +
                '<button class="ai-chat-settings-togglekey-baidu">显示</button>' +
              '</div>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label>Tavily API Key <a href="https://tavily.com" target="_blank" style="margin-left:4px">获取</a></label>' +
              '<div class="ai-chat-settings-key-row">' +
                '<input type="password" id="ai-chat-settings-tavily-key" autocomplete="new-password" placeholder="tvly-...">' +
                '<button class="ai-chat-settings-togglekey-tavily">显示</button>' +
              '</div>' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label>Tavily 最大搜索结果数</label>' +
              '<input type="number" id="ai-chat-settings-search-results" min="1" max="10" value="5">' +
            '</div>' +
            '<div class="ai-chat-settings-row">' +
              '<label>AnySearch API Key <a href="https://anysearch.com/console/api-keys" target="_blank" style="margin-left:4px">获取</a></label>' +
              '<div class="ai-chat-settings-key-row">' +
                '<input type="password" id="ai-chat-settings-anysearch-key" autocomplete="new-password" placeholder="每天1000次免费额度">' +
                '<button class="ai-chat-settings-togglekey-anysearch">显示</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="ai-chat-settings-section">' +
            '<h4 id="settings-heading-popup">AI浮窗</h4>' +
            '<div class="ai-chat-settings-row">' +
              '<label><input type="checkbox" id="ai-chat-settings-selection-popup"> 选中文本时显示AI浮窗</label>' +
            '</div>' +
          '</div>' +
          '<div class="ai-chat-settings-section">' +
            '<h4 id="settings-heading-reminders">定时提醒</h4>' +
            '<div class="ai-chat-settings-row">' +
              '<label><input type="checkbox" id="ai-chat-settings-reminder-enabled"> 开启定时提醒</label>' +
            '</div>' +
            '<div id="ai-chat-settings-reminders-list"></div>' +
            '<button id="ai-chat-settings-add-reminder" class="ai-chat-settings-btn">+ 添加提醒</button>' +
            '<p style="font-size:12px;color:#999;margin:8px 0 0;line-height:1.4">提示：为降低电脑负担每 10 秒一次时间检测，因此最多会有 10 秒的误差，敬请理解。</p>' +
          '</div>' +
'<div class="ai-chat-settings-section">' +
'<h4 id="settings-heading-experimental">实验功能</h4>' +
'<div class="ai-chat-settings-row">' +
  '<label><input type="checkbox" id="ai-chat-settings-exp-web-edit"> 任意网页编辑（非本地 HTML 也可进入编辑模式）</label>' +
'</div>' +
'<div class="ai-chat-settings-row">' +
  '<label><input type="checkbox" id="ai-chat-settings-exp-browser"> 浏览器操控模式（通过 AI 操控浏览器）</label>' +
'</div>' +
'<div class="ai-chat-settings-row ai-chat-settings-row-nested">' +
  '<label><input type="checkbox" id="ai-chat-settings-exp-browser-vision"> 视觉识别（截图识别网页内容，消耗更多 Token）</label>' +
'</div>' +
'</div>' +
'<div class="ai-chat-settings-row">' +
  '<label><input type="checkbox" id="ai-chat-settings-exp-shell"> 本地文件读写（可通过安装hupilot-shell-host，执行本地命令，读写本地文件）</label>' +
'</div>' +
'<div class="ai-chat-settings-row ai-chat-settings-row-nested" id="ai-chat-shell-status-row" style="display:none">' +
  '<span id="ai-chat-shell-status">状态: 检测中...</span>' +
'</div>' +
'<div class="ai-chat-settings-row ai-chat-settings-row-nested" id="ai-chat-shell-install-row" style="display:none">' +
  '<details style="font-size:12px">' +
    '<summary style="cursor:pointer;color:#888">查看安装指南</summary>' +
    '<p style="margin:6px 0;color:#888">请先安装 <a href="https://nodejs.org/zh-cn" target="_blank" style="color:#607cd2">Node.js</a> (>=18)。然后右键点击开始按钮——终端，复制下面的代码到命令框中按回车：</p>' +
    '<code id="ai-chat-shell-install-cmd" style="display:block;padding:8px;background:#f5f5f5;border-radius:6px;word-break:break-all;user-select:all;font-size:12px">加载中...</code>' +
    '<p style="margin:6px 0;color:#888">安装后重启浏览器，然后在对话界面点击计算机按钮启用。</p>' +
  '</details>' +
'</div>' +
'<div class="ai-chat-settings-row ai-chat-settings-row-nested" id="ai-chat-shell-test-row" style="display:none">' +
  '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">' +
    '<button id="ai-chat-shell-test-btn" style="padding:4px 12px;border:1px solid #d0d0d0;border-radius:12px;background:#f8f8f8;cursor:pointer;font-size:12px">测试连接</button>' +
    '<button id="ai-chat-shell-upgrade-btn" style="padding:4px 12px;border:1px solid #d0d0d0;border-radius:12px;background:#f8f8f8;cursor:pointer;font-size:12px">升级</button>' +
  '</div>' +
  '<div id="ai-chat-shell-status-info" style="font-size:12px;margin-top:4px"></div>' +
'</div>' +
          '<button id="ai-chat-settings-save" class="ai-chat-settings-save">保存设置</button>' +
          '<div id="ai-chat-settings-status" class="ai-chat-settings-status"></div>' +
        '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(sidebar);

    var handle = document.createElement('div');
    handle.id = 'ai-chat-resize-handle';
    sidebar.appendChild(handle);

    // DOM refs
    messagesEl = document.getElementById('ai-chat-messages');
    inputEl = document.getElementById('ai-chat-input');
    sendBtn = document.getElementById('ai-chat-send-btn');
    welcomeEl = document.getElementById('ai-chat-welcome');
    chatView = document.getElementById('ai-chat-view');
    sessionView = document.getElementById('ai-chat-session-view');
    settingsView = document.getElementById('ai-chat-settings-view');
    sessionListEl = document.getElementById('ai-chat-session-list');
    headerTitle = document.getElementById('ai-chat-header-title');
    quickActionsEl = document.getElementById('ai-chat-quick-actions');

    // Events
    document.getElementById('ai-chat-close-btn').addEventListener('click', function() { trackActivity(); closeSidebar(); });
    document.getElementById('ai-chat-view-toggle').addEventListener('click', toggleView);
    document.getElementById('ai-chat-settings-btn').addEventListener('click', showSettingsView);
    document.getElementById('ai-chat-settings-add-quick-action').addEventListener('click', function() {
      var listEl = document.getElementById('ai-chat-settings-quick-actions-list');
      var row = document.createElement('div');
      row.className = 'ai-chat-settings-qa-row';
      row.innerHTML =
        '<input class="ai-chat-settings-qa-label" placeholder="按钮文字">' +
        '<input class="ai-chat-settings-qa-prompt" placeholder="提示词">' +
        '<button class="ai-chat-settings-qa-delete"><svg viewBox="0 0 14 14" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></svg></button>';
      row.querySelector('.ai-chat-settings-qa-delete').addEventListener('click', function() {
        row.remove();
      });
      listEl.appendChild(row);
    });
    document.getElementById('ai-chat-settings-add-reminder').addEventListener('click', function() {
      var listEl = document.getElementById('ai-chat-settings-reminders-list');
      listEl.appendChild(createReminderRow({}));
    });
    document.getElementById('ai-chat-refresh-btn').addEventListener('click', function() {
      if (htmlEditMode && window.__htmlEditor) { window.__htmlEditor.resetToOriginal(); }
      else { refreshPageContent(true); }
    });
    document.getElementById('ai-chat-unlock-btn').addEventListener('click', function() {
      if (typeof enableCopyBypass === 'function' && confirm('是否需要解除网站对右键及复制的限制？如不需要，请点取消。')) { enableCopyBypass(); showToast('已解除网站对右键及复制的限制。如需撤销，请刷新网页。'); }
    });
    document.getElementById('ai-chat-save-md-btn').addEventListener('click', function() {
      if (htmlEditMode && window.__htmlEditor) {
        window.__htmlEditor.saveAsHtml().catch(function(e) {
          showToast('保存失败: ' + e.message);
        });
      }
      else { savePageAsMarkdown(); }
    });
    document.getElementById('ai-chat-translate-btn').addEventListener('click', function() {
      if (expPageTranslationEnabled) togglePageTranslation();
    });
    document.getElementById('ai-chat-html-edit-btn').addEventListener('click', function() {
      if (editorInjected && window.__htmlEditor) {
        toggleEditorMode();
      } else {
        chrome.runtime.sendMessage({ type: 'injectEditor' }, function(resp) {
          if (resp && resp.success) {
            editorInjected = true;
            setTimeout(function() { toggleEditorMode(); }, 50);
          } else {
            showToast('加载编辑器失败');
          }
        });
      }
    });
    document.getElementById('ai-chat-clear-btn').addEventListener('click', clearMessages);
    document.getElementById('ai-chat-export-btn').addEventListener('click', exportConversation);
    document.getElementById('ai-chat-new-session').addEventListener('click', handleNewSession);
    document.getElementById('ai-chat-session-edit-btn').addEventListener('click', toggleSessionEditMode);
    document.getElementById('ai-chat-session-select-all').addEventListener('click', selectAllSessions);
    document.getElementById('ai-chat-session-delete-selected').addEventListener('click', deleteSelectedSessions);
    sendBtn.addEventListener('click', function() {
      trackActivity(); if (isStreaming) { stopAI(); } else { sendMessage(); }
    });
    inputEl.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
    inputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    inputEl.addEventListener('focus', function() {
      if (isMobileMode && mobileSheetState === 50) setSheetState(100);
    });
    initDragHandle();

    document.getElementById('ai-chat-search-toggle').addEventListener('click', function() {
      var session = getCurrentSession();
      if (!session) return;
      session.webSearchEnabled = !session.webSearchEnabled;
      this.classList.toggle('ai-chat-search-off', !session.webSearchEnabled);
      this.classList.toggle('ai-chat-search-on', session.webSearchEnabled);
      saveSessions();
    });
    document.getElementById('ai-chat-shell-toggle').addEventListener('click', function() {
      var session = getCurrentSession();
      if (!session) return;
      session.shellHostEnabled = !session.shellHostEnabled;
      this.classList.toggle('ai-chat-shell-off', !session.shellHostEnabled);
      this.classList.toggle('ai-chat-shell-on', session.shellHostEnabled);
      saveSessions();
      callShellHost('tools/call', { name: 'shell_status', arguments: {} }).then(function() {
        showBiliToast('Shell 已连接');
        loadSkillList();
      }).catch(function(err) {
        showBiliToast('Shell 未连接: ' + err.message);
      });
    });
    document.getElementById('ai-chat-webqa-btn').addEventListener('click', toggleWebQaMode);
    document.getElementById('ai-chat-browser-btn').addEventListener('click', function() {
      chrome.runtime.sendMessage({ type: 'openBrowserPanel' });
    });
    document.getElementById('ai-chat-bili-subtitle-btn').addEventListener('click', function() {
      downloadBilibiliSubtitle();
    });
    document.getElementById('ai-chat-yt-subtitle-btn').addEventListener('click', function() {
      downloadYoutubeSubtitle();
    });
    document.getElementById('ai-chat-search-provider').addEventListener('change', function() {
      var val = this.value;
      readAISettings().then(function(s) {
        s.webSearchProvider = val;
        saveAISettings(s);
      });
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) closeSidebar();
    });

    headerTitle.addEventListener('click', function(e) {
      e.stopPropagation();
      startHeaderRename();
    });

    initSettingsForm();
    readAISettings().then(function(s) {
      var el = document.getElementById('ai-chat-search-provider');
      if (el) el.value = s.webSearchProvider || 'tavily';
    });
  }

  // === Resize handle ===
  function initResizeHandle() {
    var handle = document.getElementById('ai-chat-resize-handle');
    var startX, startWidth;

    function onMouseDown(e) {
      startX = e.clientX;
      startWidth = sidebarWidth;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    }

    function onMouseMove(e) {
      var newWidth = startWidth - (e.clientX - startX);
      newWidth = Math.max(280, Math.min(800, newWidth));
      sidebarWidth = newWidth;
      sidebar.style.width = newWidth + 'px';
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    handle.addEventListener('mousedown', onMouseDown);
  }

  // === Dark mode ===
  var darkModeListener = null;

  function applyDarkMode() {
    readAISettings().then(function(s) {
      var mode = s.darkMode || 'system';
      if (darkModeListener) {
        darkModeListener.mql.removeEventListener('change', darkModeListener.fn);
        darkModeListener = null;
      }
      function setDark(add) {
        if (add) { sidebar.classList.add('ai-chat-dark'); if (selectionPopupEl) selectionPopupEl.classList.add('ai-chat-dark'); }
        else { sidebar.classList.remove('ai-chat-dark'); if (selectionPopupEl) selectionPopupEl.classList.remove('ai-chat-dark'); }
      }
      if (mode === 'on') {
        setDark(true);
      } else if (mode === 'off') {
        setDark(false);
      } else {
        var mql = window.matchMedia('(prefers-color-scheme: dark)');
        var fn = function(e) { setDark(e.matches); };
        mql.addEventListener('change', fn);
        darkModeListener = { mql: mql, fn: fn };
        setDark(mql.matches);
      }
    });
  }

  // === Sidebar toggle ===
  function toggleSidebar() {
    if (isMobileMode) {
      if (!sidebarOpen) openSidebar();
      return;
    }
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  function openSidebar(skipLoad) {
    trackActivity();
    if (isMobileMode) {
      sidebar.style.transition = 'none';
      sidebar.classList.add('open');
      sidebarOpen = true;
      mobileSheetState = 50;
      sidebar.classList.remove('sheet-0', 'sheet-100');
      sidebar.classList.add('sheet-50');
      void sidebar.offsetHeight;
      sidebar.style.transition = '';
      if (floatingBtn) floatingBtn.style.display = 'none';
      applyDarkMode();
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      pollTimer = setInterval(handleUrlChange, 2000);
      showChatView();
      if (!skipLoad) loadCurrentSession();
      updateQuickActions();
      return;
    }
    if (petAnimMode) {
      var _img = document.getElementById('ai-chat-pet-img');
      var _cv = document.getElementById('ai-chat-pet-canvas');
      if (_cv && _img) {
        if (moveAnim && moveAnim.running) { cancelAnimationFrame(moveAnim.rafId); moveAnim.running = false; }
        _cv.style.transform = '';
        if (petAnimator) { petAnimator.destroy(); petAnimator = null; }
        _cv.style.display = 'none';
        _img.style.display = 'block';
      }
      petAnimMode = false;
    }
    sidebar.classList.add('open');
    sidebar.style.width = sidebarWidth + 'px';
    sidebarOpen = true;
    applyDarkMode();
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    pollTimer = setInterval(handleUrlChange, 2000);
    inputEl.focus();
    showChatView();
    if (!skipLoad) loadCurrentSession();
    updateQuickActions();
    readAISettings().then(function(s) {
      if (s.deskPetAlways === true && floatingBtn) floatingBtn.style.display = 'none';
    });
  }

  function closeSidebar() {
    if (isMobileMode) {
      setSheetState(0);
      sidebarOpen = false;
      return;
    }
    if (htmlEditMode) {
      minimizedWithEditor = true;
    } else {
      minimizedWithEditor = false;
    }
    sidebar.classList.remove('open');
    sidebarOpen = false;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    exitWebQaMode();
    readAISettings().then(function(s) {
      if (s.deskPetAlways === true && floatingBtn) {
        floatingBtn.style.display = 'flex';
        startFloatingTimer();
      }
    });
  }

  // === Mobile bottom sheet ===
  function applyMobileMode(enabled) {
    isMobileMode = enabled;
    if (enabled) {
      sidebar.classList.add('mobile-sheet');
      setSheetState(50);
      var minBtn = document.getElementById('ai-chat-minimize-btn');
      var fltBtn = document.getElementById('ai-chat-float-btn');
      if (minBtn) minBtn.style.display = 'none';
      if (fltBtn) fltBtn.style.display = 'none';
      if (floatingBtn && !sidebarOpen) { floatingBtn.style.display = 'flex'; startFloatingTimer(); }
    } else {
      sidebar.classList.remove('mobile-sheet', 'sheet-0', 'sheet-50', 'sheet-100');
      sidebar.style.removeProperty('height');
      var minBtn = document.getElementById('ai-chat-minimize-btn');
      var fltBtn = document.getElementById('ai-chat-float-btn');
      if (minBtn) minBtn.style.display = '';
      if (fltBtn) fltBtn.style.display = '';
      if (!sidebarOpen) {
        sidebar.classList.remove('open');
      }
    }
  }

  function setSheetState(state) {
    if (!isMobileMode) return;
    if (state === mobileSheetState) return;
    mobileSheetState = state;
    sidebar.classList.remove('sheet-0', 'sheet-50', 'sheet-100');
    if (state === 0) {
      sidebar.classList.add('sheet-0');
      if (floatingBtn) { floatingBtn.style.display = 'flex'; startFloatingTimer(); }
    } else if (state === 100) {
      sidebar.classList.add('sheet-100');
      if (floatingBtn) floatingBtn.style.display = 'none';
    } else {
      sidebar.classList.add('sheet-50');
      if (floatingBtn) floatingBtn.style.display = 'none';
    }
  }

  function initDragHandle() {
    var handle = document.getElementById('ai-chat-drag-handle');
    if (!handle) return;
    var dragData = null;
    function dragStart(e) {
      var y = e.touches ? e.touches[0].clientY : e.clientY;
      dragData = { startY: y, startState: mobileSheetState };
      sidebar.style.transition = 'none';
      document.addEventListener('touchmove', dragMove, { passive: false });
      document.addEventListener('touchend', dragEnd);
      document.addEventListener('mousemove', dragMove);
      document.addEventListener('mouseup', dragEnd);
      e.preventDefault();
      e.stopPropagation();
    }
    function dragMove(e) {
      if (!dragData) return;
      var y = e.touches ? e.touches[0].clientY : e.clientY;
      dragData.currentY = y;
      var vh = window.innerHeight;
      var baseHeight = dragData.startState === 100 ? vh : dragData.startState === 50 ? vh * 0.5 : 0;
      var newHeight = Math.max(0, Math.min(vh, baseHeight - (y - dragData.startY)));
      sidebar.style.setProperty('height', newHeight + 'px', 'important');
      e.preventDefault();
      e.stopPropagation();
    }
    function dragEnd(e) {
      if (!dragData) return;
      document.removeEventListener('touchmove', dragMove);
      document.removeEventListener('touchend', dragEnd);
      document.removeEventListener('mousemove', dragMove);
      document.removeEventListener('mouseup', dragEnd);
      sidebar.style.transition = '';
      sidebar.style.removeProperty('height');
      var dy = (dragData.currentY || dragData.startY) - dragData.startY;
      var start = dragData.startState;
      var threshold = window.innerHeight * 0.15;
      if (start === 0) {
        setSheetState(dy < -threshold ? 50 : 0);
      } else if (start === 50) {
        if (dy < -threshold) setSheetState(100);
        else if (dy > threshold) setSheetState(0);
        else setSheetState(50);
      } else if (start === 100) {
        setSheetState(dy > threshold ? 50 : 100);
      }
      dragData = null;
      e.preventDefault();
      e.stopPropagation();
    }
    handle.addEventListener('touchstart', dragStart, { passive: false });
    handle.addEventListener('mousedown', dragStart);
  }

  // === HTML Editor Mode ===

  function toggleEditorMode() {
    if (htmlEditMode) {
      window.__htmlEditor.exitEditMode();
      htmlEditMode = false;
      exitFloatingMode();
    } else {
      if (webQaMode) toggleWebQaMode();
      enterFloatingMode();
      window.__htmlEditor.enterEditMode();
      htmlEditMode = true;
    }
    updateEditorUIState();
    updateQuickActions();
  }

  function updateEditorUIState() {
    var btn = document.getElementById('ai-chat-html-edit-btn');
    var refreshBtn = document.getElementById('ai-chat-refresh-btn');
    var saveBtn = document.getElementById('ai-chat-save-md-btn');
    var searchBar = document.getElementById('ai-chat-search-bar');
    if (!btn) return;
    if (htmlEditMode) {
      btn.title = '退出 HTML 编辑模式';
      refreshBtn.title = '重新加载原始 HTML 文件';
      saveBtn.title = '另存为 HTML 文件';
      if (searchBar) searchBar.style.display = 'none';
    } else {
      btn.title = 'HTML 编辑模式';
      refreshBtn.title = '重新读取页面内容';
      saveBtn.title = '当前网页保存为md文件';
      if (searchBar) searchBar.style.display = '';
    }
  }

  // === Floating window ===

  function updateFloatBtn() {
    var btn = document.getElementById('ai-chat-float-btn');
    if (!btn) return;
    if (floatState) {
      btn.innerHTML = '<svg viewBox="0 0 20 20" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><rect x="3" y="4" width="14" height="12" rx="1.5" fill="currentColor" opacity="0.2"/><rect x="2" y="3" width="16" height="14" rx="2"/><path d="M2 7h16"/></svg>';
      btn.title = '恢复侧边栏';
    } else {
      btn.innerHTML = '<svg viewBox="0 0 20 20" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><rect x="2" y="3" width="16" height="14" rx="2"/><path d="M2 7h16"/></svg>';
      btn.title = '切换浮动窗口';
    }
  }

  var _petBtnSize = 'medium';
  var PET_SIZE = {
    large:  { img: 95, btnW: 95, btnH: 115, labelOffY: 15, meatW: 56, meatH: 42 },
    medium: { img: 80, btnW: 80, btnH: 100, labelOffY: 12, meatW: 47, meatH: 35 },
    small:  { img: 70, btnW: 70, btnH: 90,  labelOffY: 10, meatW: 41, meatH: 31 }
  };
  function applyPetBtnSize(key) {
    _petBtnSize = key;
    if (floatingBtn) {
      floatingBtn.className = floatingBtn.className.replace(/(^|\s)pet-size-\S+/g, '').trim();
      floatingBtn.classList.add('pet-size-' + key);
    }
    if (petAnimator) { petAnimator.displayW = PET_SIZE[key].img; petAnimator.displayH = PET_SIZE[key].img; }
  }

  function enterFloatingMode() {
    if (floatState) return;
    floatState = {
      origRight: sidebar.style.right,
      origLeft: sidebar.style.left,
      origTop: sidebar.style.top,
      origBottom: sidebar.style.bottom,
      origWidth: sidebar.style.width,
      origHeight: sidebar.style.height,
      origBorderRadius: sidebar.style.borderRadius,
    };
    var stored = null;
    try { stored = JSON.parse(localStorage.getItem('hupilot_float_pos')); } catch(e) {}
    var w = (stored && stored.width) || 400;
    var h = (stored && stored.height) || Math.min(600, window.innerHeight - 40);
    var x = (stored && stored.x) || Math.max(0, window.innerWidth - w - 20);
    var y = (stored && stored.y) || 60;
    sidebar.style.right = '';
    sidebar.style.setProperty('left', x + 'px', 'important');
    sidebar.style.setProperty('top', y + 'px', 'important');
    sidebar.style.width = w + 'px';
    sidebar.style.setProperty('height', h + 'px', 'important');
    sidebar.style.borderRadius = '12px';
    sidebar.style.boxShadow = '0 8px 32px rgba(0,0,0,0.2), -2px 0 12px rgba(0,0,0,0.12)';
    var resizeHandle = document.getElementById('ai-chat-resize-handle');
    if (resizeHandle) resizeHandle.style.display = 'none';
    sidebar.classList.add('ai-chat-floating');
    initFloatDrag();
    initFloatResize();
    updateFloatBtn();
  }

  function exitFloatingMode() {
    if (!floatState) return;
    cleanupFloatDrag();
    cleanupFloatResize();
    sidebar.style.left = floatState.origLeft || '';
    sidebar.style.top = floatState.origTop || '';
    sidebar.style.right = floatState.origRight || '';
    sidebar.style.bottom = floatState.origBottom || '';
    sidebar.style.width = floatState.origWidth || '';
    sidebar.style.height = floatState.origHeight || '';
    sidebar.style.borderRadius = floatState.origBorderRadius || '';
    sidebar.style.boxShadow = '';
    var resizeHandle = document.getElementById('ai-chat-resize-handle');
    if (resizeHandle) resizeHandle.style.display = '';
    sidebar.classList.remove('ai-chat-floating');
    floatState = null;
    updateFloatBtn();
  }

  function initFloatDrag() {
    var header = document.getElementById('ai-chat-header');
    if (!header) return;
    var onMouseDown = function(e) {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.target.closest('#ai-chat-header-actions')) return;
      floatDragData = { startX: e.clientX, startY: e.clientY, startLeft: parseInt(sidebar.style.left), startTop: parseInt(sidebar.style.top) };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    };
    var onMouseMove = function(e) {
      if (!floatDragData) return;
      var dx = e.clientX - floatDragData.startX;
      var dy = e.clientY - floatDragData.startY;
      sidebar.style.setProperty('left', Math.max(0, floatDragData.startLeft + dx) + 'px', 'important');
      sidebar.style.setProperty('top', Math.max(0, floatDragData.startTop + dy) + 'px', 'important');
    };
    var onMouseUp = function() {
      floatDragData = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      saveFloatPos();
    };
    header.addEventListener('mousedown', onMouseDown);
    header._floatDrag = { onMouseDown: onMouseDown, onMouseMove: onMouseMove, onMouseUp: onMouseUp };
  }

  function cleanupFloatDrag() {
    var header = document.getElementById('ai-chat-header');
    if (header && header._floatDrag) {
      header.removeEventListener('mousedown', header._floatDrag.onMouseDown);
      document.removeEventListener('mousemove', header._floatDrag.onMouseMove);
      document.removeEventListener('mouseup', header._floatDrag.onMouseUp);
      delete header._floatDrag;
    }
    floatDragData = null;
  }

  function initFloatResize() {
    var handle = document.createElement('div');
    handle.id = 'ai-chat-float-resize-handle';
    handle.style.cssText = 'position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize;z-index:2;background:transparent';
    handle.innerHTML = '';
    sidebar.appendChild(handle);
    var onMouseDown = function(e) {
      e.preventDefault();
      e.stopPropagation();
      var startX = e.clientX, startY = e.clientY;
      var startW = sidebar.offsetWidth, startH = sidebar.offsetHeight;
      var startL = parseInt(sidebar.style.left) || 0;
      var onMove = function(ev) {
        var dw = ev.clientX - startX;
        var dh = ev.clientY - startY;
        var newW = Math.max(280, startW + dw);
        var newH = Math.max(300, startH + dh);
        sidebar.style.width = newW + 'px';
        sidebar.style.setProperty('height', newH + 'px', 'important');
      };
      var onUp = function() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        saveFloatPos();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
    handle.addEventListener('mousedown', onMouseDown);
    sidebar._floatResize = { handle: handle, onMouseDown: onMouseDown };
  }

  function cleanupFloatResize() {
    if (sidebar._floatResize) {
      sidebar._floatResize.handle.removeEventListener('mousedown', sidebar._floatResize.onMouseDown);
      sidebar._floatResize.handle.remove();
      delete sidebar._floatResize;
    }
  }

  function saveFloatPos() {
    try {
      localStorage.setItem('hupilot_float_pos', JSON.stringify({
        x: parseInt(sidebar.style.left),
        y: parseInt(sidebar.style.top),
        width: sidebar.offsetWidth,
        height: sidebar.offsetHeight,
      }));
    } catch(e) {}
  }

  function showEditorQuickActions() {
    quickActionsEl.innerHTML = '';
    var actions = [
      { id: 'he_edit_toggle', label: htmlEditMode ? '退出编辑' : '编辑模式', type: 'toggle',
        svg: '<svg viewBox="0 0 20 20" width="16" height="16" style="vertical-align:middle;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round"><line x1="4" y1="4" x2="16" y2="16"/><line x1="16" y1="4" x2="4" y2="16"/></svg>' },
      { id: 'he_undo', label: '撤销', type: 'undo',
        svg: '<svg viewBox="0 0 20 20" width="16" height="16" style="vertical-align:middle;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round"><polyline points="7 5 3 9 7 13"/><path d="M3 9h10a4 4 0 0 1 0 8h-2"/></svg>' },
      { id: 'he_redo', label: '恢复', type: 'redo',
        svg: '<svg viewBox="0 0 20 20" width="16" height="16" style="vertical-align:middle;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round"><polyline points="13 5 17 9 13 13"/><path d="M17 9H7a4 4 0 0 0 0 8h2"/></svg>' },
      { id: 'he_color', label: 'AI 改样式', type: 'color',
        svg: '<svg viewBox="0 0 20 20" width="16" height="16" style="vertical-align:middle;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round"><path d="M14 3l3 3-9 9-4 1 1-4 9-9z"/><path d="M12 5l3 3"/></svg>' },
    ];
    actions.forEach(function(action) {
      var btn = document.createElement('button');
      btn.style.cssText = 'display:inline-flex;align-items:center;gap:3px';
      btn.innerHTML = action.svg + '<span>' + action.label + '</span>';
      btn.title = action.label;
      if (htmlEditMode && action.id === 'he_edit_toggle') btn.className = 'he-btn-danger';
      if (action.type === 'toggle') {
        btn.addEventListener('click', function() { toggleEditorMode(); });
      } else if (action.type === 'undo') {
        btn.addEventListener('click', function() { if (window.__htmlEditor) window.__htmlEditor.undo(); });
      } else if (action.type === 'redo') {
        btn.addEventListener('click', function() { if (window.__htmlEditor) window.__htmlEditor.redo(); });
      } else if (action.type === 'color') {
        btn.addEventListener('click', function() {
          var info = window.__htmlEditor && window.__htmlEditor.getSelectedInfo();
          if (!info) { showToast('请先点击选中页面上的一个元素'); return; }
          window.__heAIStylePrompt = '请帮我修改这个元素的样式。当前样式：' + JSON.stringify(info.style) + '。元素内容：' + info.innerText.substring(0, 100) + '。请用 [APPLY] 格式返回修改。';
          inputEl.value = '<AI 改样式>';
          inputEl.style.height = 'auto';
          inputEl.focus();
        });
      }
      quickActionsEl.appendChild(btn);
    });
  }

  function handleEditorAIApply(content) {
    if (!content || !window.__htmlEditor || !htmlEditMode) return;
    var pattern = /\[APPLY\]([\s\S]*?)\[\/APPLY\]/;
    var match = content.match(pattern);
    if (match) {
      try {
        var data = JSON.parse(match[1].trim());
        window.__htmlEditor.applyAIChanges(data);
        showToast('AI 修改已应用');
      } catch (e) {
        console.log('[Editor] Failed to parse APPLY block:', e.message);
      }
    }
  }

  // === Minimize / Floating button ===
  function createFloatingBtn() {
    floatingBtn = document.createElement('div');
    floatingBtn.id = 'ai-chat-floating-btn';
    floatingBtn.className = 'pet-size-large';
    floatingBtn.innerHTML = '<div id="ai-chat-floating-label">我饿了</div><img src="' + chrome.runtime.getURL('icons/hupilot-small.png') + '" alt="虎宝" id="ai-chat-pet-img"><canvas id="ai-chat-pet-canvas" style="display:none"></canvas>';
    document.body.appendChild(floatingBtn);

    var tooltip = document.createElement('div');
    tooltip.id = 'ai-chat-floating-tooltip';
    tooltip.textContent = '右键点击显示菜单';
    document.body.appendChild(tooltip);
    function positionTooltip() {
      var r = floatingBtn.getBoundingClientRect();
      tooltip.style.left = (r.left + r.width / 2) + 'px';
      tooltip.style.top = (r.top - 8) + 'px';
    }
    var tooltipTimer = null;
    floatingBtn.addEventListener('mouseenter', function() {
      if (localStorage.getItem('hupilot_tt_day') === new Date().toDateString()) return;
      localStorage.setItem('hupilot_tt_day', new Date().toDateString());
      positionTooltip();
      tooltip.style.display = 'block';
      if (tooltipTimer) clearTimeout(tooltipTimer);
      tooltipTimer = setTimeout(function() { tooltip.style.display = 'none'; }, 2000);
    });
    floatingBtn.addEventListener('mouseleave', function() {
      if (tooltipTimer) clearTimeout(tooltipTimer);
      tooltip.style.display = 'none';
    });

    var savedX = localStorage.getItem('hupilot_fx');
    var savedY = localStorage.getItem('hupilot_fy');
    if (savedX !== null && savedY !== null) {
      floatingBtn.style.left = savedX + 'px';
      floatingBtn.style.top = savedY + 'px';
      floatingBtn.style.right = 'auto';
      floatingBtn.style.bottom = 'auto';
    }

    exitPetAnimMode();

    petAnimMode = false;
    var isDragging = false, dragStartX = 0, dragStartY = 0;
    var btnStartX = 0, btnStartY = 0, moved = false;
    moveAnim = { running: false, rafId: null };
    var leftSpriteUrl = chrome.runtime.getURL('icons/pet-sprite-left.png');
    var btnImg = floatingBtn.querySelector('img');
    var normalIcon = chrome.runtime.getURL('icons/hupilot-small.png');
    var dragIcon = chrome.runtime.getURL('icons/hupilot-1.png');
    var petCanvas = document.getElementById('ai-chat-pet-canvas');
    var petSpriteUrl = chrome.runtime.getURL('icons/pet-sprite.png');
    var eatMeatSpriteUrl = chrome.runtime.getURL('icons/eat-meat-sprite.png');
    var headpatSpriteUrl = chrome.runtime.getURL('icons/pet-headpat-sprite.png');

    function enterPetAnimMode() {
      var img = document.getElementById('ai-chat-pet-img');
      var canvas = document.getElementById('ai-chat-pet-canvas');
      if (!canvas || !img) return;
      img.style.display = 'none';
      canvas.style.display = 'block';
      if (petAnimator) petAnimator.destroy();
      petAnimator = new PetAnimator(canvas, {
        sheetUrl: petSpriteUrl,
        displayW: 95, displayH: 95,
        frameW: 150, frameH: 150,
        cols: 10, rows: 12, totalFrames: 120, fps: 20
      });
      petAnimator.play();
    }

    function exitPetAnimMode() {
      var img = document.getElementById('ai-chat-pet-img');
      var canvas = document.getElementById('ai-chat-pet-canvas');
      if (!canvas || !img) return;
      if (moveAnim && moveAnim.running) { cancelAnimationFrame(moveAnim.rafId); moveAnim.running = false; }
      if (petCanvas) petCanvas.style.transform = '';
      if (petAnimator) { petAnimator.destroy(); petAnimator = null; }
      canvas.style.display = 'none';
      img.style.display = 'block';
    }

    function togglePetAnimMode() {
      if (petAnimMode) {
        exitPetAnimMode();
      } else {
        enterPetAnimMode();
      }
      petAnimMode = !petAnimMode;
    }

    floatingBtn.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      trackActivity();
      if (petAnimMode) return;
      if (moveAnim && moveAnim.running) {
        cancelAnimationFrame(moveAnim.rafId);
        moveAnim.running = false;
        if (petCanvas) petCanvas.style.transform = '';
        if (petAnimator) { petAnimator.setSprite(petSpriteUrl); petAnimator.fps = 18; petAnimator.cols = 10; petAnimator.rows = 12; petAnimator.totalFrames = 120; }
      }
      isDragging = true;
      moved = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      var rect = floatingBtn.getBoundingClientRect();
      btnStartX = rect.left;
      btnStartY = rect.top;
      floatingBtn.style.cursor = 'grabbing';
      if (petAnimator) { petAnimator.pause(); }
      if (petCanvas) { petCanvas.style.display = 'none'; btnImg.style.display = 'block'; }
      if (btnImg) btnImg.src = dragIcon;
      if (floatingHideTimer) { clearTimeout(floatingHideTimer); floatingHideTimer = null; }
      var label = document.getElementById('ai-chat-floating-label');
      if (label) {
        var dragTexts = ['我在飞~','起飞','哇~好高','举高高'];
        label.textContent = dragTexts[Math.floor(Math.random() * dragTexts.length)];
        label.style.visibility = 'visible';
        floatingHideTimer = setTimeout(function() { label.style.visibility = 'hidden'; }, 6000);
      }
      e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      var dx = e.clientX - dragStartX;
      var dy = e.clientY - dragStartY;
      if (!moved && Math.hypot(dx, dy) > 2) {
        moved = true;
        if (petAnimMode && petAnimator && petCanvas) {
          petAnimator.pause();
          petCanvas.style.display = 'none';
          btnImg.style.display = 'block';
        }
        if (btnImg) btnImg.src = dragIcon;
      }
      btnStartX += dx;
      btnStartY += dy;
      btnStartX = Math.max(0, Math.min(btnStartX, window.innerWidth - 70));
      btnStartY = Math.max(0, Math.min(btnStartY, window.innerHeight - 90));
      floatingBtn.style.left = btnStartX + 'px';
      floatingBtn.style.top = btnStartY + 'px';
      floatingBtn.style.right = 'auto';
      floatingBtn.style.bottom = 'auto';
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      if (tooltip.style.display === 'block') positionTooltip();
    });

    document.addEventListener('mouseup', function(e) {
      if (!isDragging) return;
      isDragging = false;
      floatingBtn.style.cursor = 'grab';
      if (btnImg) btnImg.src = normalIcon;
      if (petAnimator && petCanvas) { btnImg.style.display = 'none'; petCanvas.style.display = 'block'; petAnimator.resume(); }
      if (floatingHideTimer) { clearTimeout(floatingHideTimer); floatingHideTimer = null; }
      var label = document.getElementById('ai-chat-floating-label');
      if (label) label.style.visibility = 'hidden';
      if (moved) {
        try {
          localStorage.setItem('hupilot_fx', btnStartX);
          localStorage.setItem('hupilot_fy', btnStartY);
        } catch(e) {}
      } else if (isMobileMode) {
        openSidebar();
      }
    });


    document.addEventListener('click', function(e) {
      if (petAnimMode && petAnimator && petCanvas) {
        if (menu && menu.contains(e.target)) return;
        if (floatingBtn.contains(e.target)) {
          if (moveAnim && moveAnim.running) return;
          trackActivity();
          triggerHeadpat();
          return;
        }
        trackActivity();
        if (moveAnim && moveAnim.running) { cancelAnimationFrame(moveAnim.rafId); moveAnim.running = false; }
        if (petCanvas) petCanvas.style.transform = '';
        if (!petAnimator.playing) petAnimator.play();
        movePetTo(e.clientX, e.clientY);
        showMeatAt(e.clientX, e.clientY);
      }
    });

    var _currentMeat = null;
    var _pendingEatMeat = false;
    function showMeatAt(x, y) {
      if (_currentMeat) { _currentMeat.remove(); _currentMeat = null; }
      var sz = PET_SIZE[_petBtnSize] || PET_SIZE.large;
      var img = document.createElement('img');
      img.src = chrome.runtime.getURL('icons/rou.png');
      img.style.cssText = 'position:fixed;left:' + (x - Math.round(sz.meatW/2)) + 'px;top:' + (y - Math.round(sz.meatH/2)) + 'px;width:' + sz.meatW + 'px;height:' + sz.meatH + 'px;z-index:2147483646;pointer-events:none;';
      document.body.appendChild(img);
      _currentMeat = img;
      var ci = setInterval(function() {
        if (!img.parentNode) { clearInterval(ci); return; }
        var ir = img.getBoundingClientRect(), fr = floatingBtn.getBoundingClientRect();
        if (ir.right > fr.left && ir.left < fr.right && ir.bottom > fr.top && ir.top < fr.bottom) {
          img.remove(); _currentMeat = null; clearInterval(ci);
          _pendingEatMeat = true;
        }
      }, 50);
    }

    function movePetTo(clientX, clientY) {
      var rect = floatingBtn.getBoundingClientRect();
      var startX = rect.left;
      var startY = rect.top;

      var sz = PET_SIZE[_petBtnSize] || PET_SIZE.large;
      var half = Math.round(sz.img / 2);
      var targetX = clientX - half;
      var targetY = clientY - (half + sz.labelOffY);
      targetX = Math.max(0, Math.min(targetX, window.innerWidth - sz.btnW));
      targetY = Math.max(0, Math.min(targetY, window.innerHeight - sz.btnH));

      var ml = document.getElementById('ai-chat-floating-label');
      if (ml) {
        var moveTexts = ['我要吃肉！', '好大一块肉！', '有好吃的！'];
        ml.textContent = moveTexts[Math.floor(Math.random() * moveTexts.length)];
        ml.style.visibility = 'visible';
      }
      if (moveAnim._labelTimer) { clearTimeout(moveAnim._labelTimer); }
      moveAnim._labelTimer = setTimeout(function() {
        var ml2 = document.getElementById('ai-chat-floating-label');
        if (ml2) ml2.style.visibility = 'hidden';
        moveAnim._labelTimer = null;
}, 3000);

      var dx = targetX - startX;
      var dy = targetY - startY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 5) return;

      var speed = 70;
      var duration = dist / speed * 1000;

      var leanDeg = Math.asin(-dy / dist) * (180 / Math.PI);
      if (leanDeg > 20) leanDeg = 20;
      if (leanDeg < -20) leanDeg = -20;

      if (petCanvas) {
        var moveLeft = dx < 0;
        if (moveLeft) {
          petCanvas.style.transform = 'rotate(' + leanDeg + 'deg)';
        } else {
          petCanvas.style.transform = 'scaleX(-1) rotate(' + leanDeg + 'deg)';
        }
      }
      if (petAnimator) { petAnimator.pause(); petAnimator.setSprite(leftSpriteUrl); petAnimator.fps = 24; petAnimator.cols = 11; petAnimator.rows = 11; petAnimator.totalFrames = 121; petAnimator.play(); }

      moveAnim.running = true;
      var startTime = performance.now();

      function step(now) {
        var t = Math.min((now - startTime) / duration, 1);
        var ease = t;

        var x = startX + dx * ease;
        var y = startY + dy * ease;

        floatingBtn.style.left = x + 'px';
        floatingBtn.style.top = y + 'px';
        floatingBtn.style.right = 'auto';
        floatingBtn.style.bottom = 'auto';

        if (t < 1) {
          moveAnim.rafId = requestAnimationFrame(step);
        } else {
          if (petCanvas) petCanvas.style.transform = '';
          if (petAnimator) {
            if (_pendingEatMeat) {
              _pendingEatMeat = false;
              triggerEatMeat();
            } else {
              petAnimator.setSprite(petSpriteUrl);
              petAnimator.fps = 18;
              petAnimator.cols = 10; petAnimator.rows = 12; petAnimator.totalFrames = 120;
              petAnimator._drawFrame();
            }
          }
          moveAnim.running = false;
          if (moveAnim._labelTimer) { clearTimeout(moveAnim._labelTimer); moveAnim._labelTimer = null; }
          var ml2 = document.getElementById('ai-chat-floating-label');
          if (ml2) ml2.style.visibility = 'hidden';
          try {
            localStorage.setItem('hupilot_fx', targetX);
            localStorage.setItem('hupilot_fy', targetY);
          } catch(ex) {}
        }
      }

      moveAnim.rafId = requestAnimationFrame(step);
    }

    function triggerEatMeat() {
      if (!petAnimator) return;
      petAnimator.pause();
      petAnimator.setSprite(eatMeatSpriteUrl);
      petAnimator.fps = 24;
      petAnimator.cols = 11;
      petAnimator.rows = 11;
      petAnimator.totalFrames = 121;
      petAnimator.playOnce(function() {
        petAnimator.setSprite(petSpriteUrl);
        petAnimator.fps = 18;
        petAnimator.cols = 10;
        petAnimator.rows = 12;
        petAnimator.totalFrames = 120;
        petAnimator.play();
      });
    }

    function triggerHeadpat() {
      if (!petAnimator) return;
      petAnimator.pause();
      petAnimator.setSprite(headpatSpriteUrl);
      petAnimator.fps = 24;
      petAnimator.cols = 11;
      petAnimator.rows = 11;
      petAnimator.totalFrames = 121;
      petAnimator.playOnce(function() {
        petAnimator.setSprite(petSpriteUrl);
        petAnimator.fps = 18;
        petAnimator.cols = 10;
        petAnimator.rows = 12;
        petAnimator.totalFrames = 120;
        petAnimator.play();
      });
    }

    // === Floating button right-click menu ===
    var menu = document.createElement('div');
    menu.id = 'ai-chat-floating-menu';
    document.body.appendChild(menu);

    function buildMenu() {
      var editModeItem = '';
    if (isHtmlFile || expWebEditEnabled) {
        var isOn = window.__htmlEditor ? window.__htmlEditor.isEditMode() : false;
        editModeItem = '<div class="menu-item menu-item-danger" data-action="edit-mode">' + (isOn ? '退出编辑' : '编辑模式') + '</div>';
      }
      var translateItem = '';
      var forceRetranslateItem = '';
      if (expPageTranslationEnabled) {
        translateItem = '<div class="menu-item" data-action="translate-page">' + (ptState === 'translated' ? '还原原文' : '翻译网页') + '</div>';
        if (ptState === 'translated' || ptHasCache) forceRetranslateItem = '<div class="menu-item" data-action="translate-force">强制重翻</div>';
      }
      var browserItem = '';
      var captureItem = '';
      if (browserControlEnabled) {
        browserItem = '<div class="menu-item menu-item-danger" data-action="browser-control">操控网页</div>';
        captureItem = '<div class="menu-item menu-item-danger" data-action="capture-page">网站截图</div>';
      }
      menu.innerHTML =
        '<div class="menu-item" data-action="open">打开虎宝</div>' +
        '<div class="menu-item" data-action="hide">暂时关闭</div>' +
        (isMobileMode ? '' : '<div class="menu-item" data-action="permanent" title="仅在最小化时显示">永久隐藏</div>') +
        '<div class="menu-item" data-action="toggle-pet-anim">' + (petAnimMode ? '退出互动' : '互动模式') + '</div>' +
        '<div class="menu-item" data-action="unlock">解除限制</div>' +
        '<div class="menu-item" data-action="save-page">提取网页</div>' +
        translateItem +
        forceRetranslateItem +
        browserItem +
        captureItem +
        editModeItem +
        '<div class="menu-item" data-action="settings">设置选项</div>' +
        '<div class="menu-item" data-action="close">关闭菜单</div>';
    }

    floatingBtn.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      e.stopPropagation();
      trackActivity();
      buildMenu();
      menu.style.display = 'block';
      var rect = menu.getBoundingClientRect();
      var x = e.clientX, y = e.clientY;
      if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
      if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
    });

    // Touch events for mobile
    var _touchData = null;
    floatingBtn.addEventListener('touchstart', function(e) {
      if (petAnimMode) return;
      if (moveAnim && moveAnim.running) {
        cancelAnimationFrame(moveAnim.rafId);
        moveAnim.running = false;
        if (petCanvas) petCanvas.style.transform = '';
        if (petAnimator) { petAnimator.setSprite(petSpriteUrl); petAnimator.fps = 18; petAnimator.cols = 10; petAnimator.rows = 12; petAnimator.totalFrames = 120; }
      }
      var t = e.touches[0];
      _touchData = { startX: t.clientX, startY: t.clientY, moved: false, longPress: false };
      _touchData._timer = setTimeout(function() {
        if (_touchData && !_touchData.moved) {
          _touchData.longPress = true;
          var ce = new MouseEvent('contextmenu', { clientX: _touchData.startX, clientY: _touchData.startY, bubbles: true, cancelable: true });
          floatingBtn.dispatchEvent(ce);
        }
      }, 500);
    }, { passive: true });
    floatingBtn.addEventListener('touchmove', function(e) {
      if (!_touchData) return;
      var t = e.touches[0];
      var dx = t.clientX - _touchData.startX;
      var dy = t.clientY - _touchData.startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        _touchData.moved = true;
        if (_touchData._timer) { clearTimeout(_touchData._timer); _touchData._timer = null; }
        // Simulate mousedown for drag
        if (!isDragging) {
          var md = new MouseEvent('mousedown', { clientX: t.clientX, clientY: t.clientY, button: 0, bubbles: true, cancelable: true });
          floatingBtn.dispatchEvent(md);
        }
      }
    }, { passive: true });
    floatingBtn.addEventListener('touchend', function(e) {
      if (!_touchData) return;
      if (_touchData._timer) { clearTimeout(_touchData._timer); _touchData._timer = null; }
      if (_touchData.moved) {
        // End drag - simulate mouseup
        var mu = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
        document.dispatchEvent(mu);
      } else if (!_touchData.longPress && isMobileMode) {
        openSidebar();
      }
      _touchData = null;
    }, { passive: true });

    function hideMenu() { menu.style.display = 'none'; }

    menu.addEventListener('click', function(e) {
      var item = e.target.closest('.menu-item');
      if (!item) return;
      hideMenu();
      var action = item.getAttribute('data-action');
      if (action === 'open') {
        restoreSidebar();
      } else if (action === 'hide') {
        floatingBtn.style.display = 'none';
        if (floatingTimer) { clearInterval(floatingTimer); floatingTimer = null; }
        if (floatingHideTimer) { clearTimeout(floatingHideTimer); floatingHideTimer = null; }
      } else if (action === 'save-page') {
        savePageAsMarkdown();
      } else if (action === 'permanent') {
        floatingBtn.style.display = 'none';
        if (floatingTimer) { clearInterval(floatingTimer); floatingTimer = null; }
        if (floatingHideTimer) { clearTimeout(floatingHideTimer); floatingHideTimer = null; }
        readAISettings().then(function(s) {
          s.deskPetAlways = false;
          return saveAISettings(s);
        });
      } else if (action === 'settings') {
        floatingBtn.style.display = 'none';
        if (floatingTimer) { clearInterval(floatingTimer); floatingTimer = null; }
        if (floatingHideTimer) { clearTimeout(floatingHideTimer); floatingHideTimer = null; }
        openSidebar();
        showSettingsView();
      } else if (action === 'toggle-pet-anim') {
        togglePetAnimMode();
        showToast(petAnimMode ? '已切换到互动模式' : '已退出互动模式');
      } else if (action === 'unlock') {
        if (typeof enableCopyBypass === 'function' && confirm('是否需要解除网站对右键及复制的限制？如不需要，请点取消。')) { enableCopyBypass(); showToast('已解除网站对右键及复制的限制。如需撤销，请刷新网页。'); }
      } else if (action === 'translate-page') {
        togglePageTranslation();
      } else if (action === 'translate-force') {
        doTranslate(true);
      } else if (action === 'browser-control') {
        chrome.runtime.sendMessage({ type: 'openBrowserPanel' });
      } else if (action === 'capture-page') {
        chrome.runtime.sendMessage({ type: 'captureFullPage' });
      } else if (action === 'edit-mode') {
        if (window.__htmlEditor) {
          toggleEditorMode();
        } else if (editorInjected === false) {
          chrome.runtime.sendMessage({ type: 'injectEditor' }, function(resp) {
            if (resp && resp.success) {
              editorInjected = true;
              setTimeout(function() { toggleEditorMode(); }, 50);
            } else {
              showToast('加载编辑器失败');
            }
          });
        }
      }
    });

    document.addEventListener('click', function(e) {
      if (menu.style.display === 'block' && !menu.contains(e.target) && e.target !== floatingBtn) {
        hideMenu();
      }
    });

    document.getElementById('ai-chat-minimize-btn').addEventListener('click', function() {
      trackActivity();
      minimizeSidebar();
    });
    document.getElementById('ai-chat-float-btn').addEventListener('click', function() {
      trackActivity();
      if (floatState) exitFloatingMode();
      else enterFloatingMode();
      updateFloatBtn();
    });
  }

  var minimizedSessionId = null;
  var minimizedUrl = null;
  var minimizedWithEditor = false;

  var floatingTexts = function() {
    if (sleepState.isSleeping) return getSleepTexts();
    try {
      var v = localStorage.getItem('hupilot_tc');
      if (v) { var a = JSON.parse(v); if (Array.isArray(a) && a.length) return a; }
    } catch(e) {}
    return ['我饿了', '休息一下吧', '陪我玩一会儿', '工作辛苦了', '下午茶时间', '散步时间', '我要吃肉！', '我是一只小老虎', '嗷呜~嗷呜~'];
  };

  function startFloatingTimer() {
    if (floatingTimer) clearInterval(floatingTimer);
    if (floatingHideTimer) clearTimeout(floatingHideTimer);
    var intervalMin = parseInt(localStorage.getItem('hupilot_iv')) || 1;
    var durationSec = parseInt(localStorage.getItem('hupilot_dr')) || 6;
    var showText = function() {
      var texts = floatingTexts();
      var label = document.getElementById('ai-chat-floating-label');
      if (!label || texts.length === 0) return;
      label.textContent = texts[Math.floor(Math.random() * texts.length)];
      label.style.visibility = 'visible';
      if (floatingHideTimer) clearTimeout(floatingHideTimer);
      floatingHideTimer = setTimeout(function() { label.style.visibility = 'hidden'; }, durationSec * 1000);
    };
    floatingTimer = setInterval(showText, intervalMin * 60000);
  }
  var floatingTimer = null;
  var floatingHideTimer = null;

  // ===== Sleep mode =====
  var sleepState = {
    timer: null,
    isSleeping: false,
    timeout: 3,
    _imgTimer: null,
  };

  function getSleepTexts() {
    try {
      var v = localStorage.getItem('hupilot_stc');
      if (v) { var a = JSON.parse(v); if (Array.isArray(a) && a.length) return a; }
    } catch(e) {}
    return ['好多肉','真好吃','z  z  z','吃不下了','再睡一会儿'];
  }

  function goToSleep() {
    if (sleepState.isSleeping) return;
    if (moveAnim && moveAnim.running) { cancelAnimationFrame(moveAnim.rafId); moveAnim.running = false; }
    if (petAnimMode) {
      var _img = document.getElementById('ai-chat-pet-img');
      var _canvas = document.getElementById('ai-chat-pet-canvas');
      if (_canvas && _img) {
        if (petAnimator) { petAnimator.destroy(); petAnimator = null; }
        _canvas.style.display = 'none';
        _img.style.display = 'block';
      }
      petAnimMode = false;
    }
    sleepState.isSleeping = true;
    try {
      var img = floatingBtn && floatingBtn.querySelector('img');
      if (img) img.src = chrome.runtime.getURL('icons/hupilot-3.png');
      var label = document.getElementById('ai-chat-floating-label');
      if (label) label.classList.add('he-sleep-left');
      if (sleepState._imgTimer) clearInterval(sleepState._imgTimer);
      var toggle = function() {
        try {
          var i = floatingBtn && floatingBtn.querySelector('img');
          if (!i) return;
          i.src = i.src.indexOf('hupilot-3.png') > 0
            ? chrome.runtime.getURL('icons/hupilot-4.png')
            : chrome.runtime.getURL('icons/hupilot-3.png');
        } catch(e) {}
      };
      sleepState._imgTimer = setInterval(toggle, 600000);
    } catch(e) {}
  }

  function wakeUp() {
    if (!sleepState.isSleeping) return;
    sleepState.isSleeping = false;
    if (sleepState._imgTimer) { clearInterval(sleepState._imgTimer); sleepState._imgTimer = null; }
    try {
      var img = floatingBtn && floatingBtn.querySelector('img');
      if (img) img.src = chrome.runtime.getURL('icons/hupilot-small.png');
      var label = document.getElementById('ai-chat-floating-label');
      if (label) {
        label.classList.remove('he-sleep-left');
        label.style.visibility = 'hidden';
        if (floatingHideTimer) { clearTimeout(floatingHideTimer); floatingHideTimer = null; }
      }
    } catch(e) {}
  }

  function trackActivity() {
    if (sleepState.timer) clearTimeout(sleepState.timer);
    if (sleepState.isSleeping) wakeUp();
    if (sleepState.timeout > 0) {
      sleepState.timer = setTimeout(goToSleep, sleepState.timeout * 60000);
    }
  }

  function initSleepMode() {
    try {
      var v = parseInt(localStorage.getItem('hupilot_st'));
      if (isNaN(v)) v = 3;
      sleepState.timeout = v;
    } catch(e) {}
    if (sleepState.timeout > 0) {
      sleepState.timer = setTimeout(goToSleep, sleepState.timeout * 60000);
    }
  }

  function minimizeSidebar() {
    var session = getCurrentSession();
    if (session) {
      minimizedSessionId = session.id;
      minimizedUrl = window.location.href;
      saveSessions();
    }
    if (htmlEditMode) {
      // 编辑模式下最小化：只隐藏，不退出编辑
      sidebar.classList.remove('open');
      sidebarOpen = false;
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      minimizedWithEditor = true;
    } else {
      closeSidebar();
    }
    floatingBtn.style.display = 'flex';
    startFloatingTimer();
  }

  function restoreSidebar() {
    trackActivity();
    floatingBtn.style.display = 'none';
    if (floatingTimer) { clearInterval(floatingTimer); floatingTimer = null; }
    if (floatingHideTimer) { clearTimeout(floatingHideTimer); floatingHideTimer = null; }

    if (minimizedWithEditor) {
      minimizedWithEditor = false;
      if (window.__htmlEditor) {
        if (!htmlEditMode) {
          enterFloatingMode();
          window.__htmlEditor.enterEditMode();
          htmlEditMode = true;
          updateEditorUIState();
        }
        sidebar.classList.add('open');
        sidebarOpen = true;
        applyDarkMode();
        pollTimer = setInterval(handleUrlChange, 2000);
        updateQuickActions();
        inputEl.focus();
        showChatView();
        return;
      }
    }

    readAISettings().then(function(s) {
      var urlChanged = minimizedUrl && window.location.href !== minimizedUrl;

      if (!urlChanged && minimizedSessionId && getSession(minimizedSessionId)) {
        sidebar.classList.add('open');
        sidebar.style.width = sidebarWidth + 'px';
        sidebarOpen = true;
        applyDarkMode();
        pollTimer = setInterval(handleUrlChange, 2000);
        showChatView();
        updateQuickActions();
        inputEl.focus();
        var url = window.location.href;
        currentDomainKey = getDomainKey(url);
        currentFullUrl = url;
        switchSession(minimizedSessionId).then(function() {
          renderSessionList(); renderMessages(); updateHeaderTitle(); updateSearchToggle(); updateShellToggle();
          loadPageContent();
        });
      } else {
        openSidebar();
      }
      minimizedSessionId = null;
      minimizedUrl = null;
    });
  }

  // === Content extraction ===
  function isPdfPage() {
    if (location.protocol !== 'http:' && location.protocol !== 'https:' && location.protocol !== 'file:') {
      console.log('[PDF] skip: protocol=' + location.protocol);
      return false;
    }
    var found = document.contentType === 'application/pdf'
      || document.querySelector('embed[type="application/pdf"]')
      || document.querySelector('object[type="application/pdf"]');
    console.log('[PDF] isPdfPage=' + found + ' contentType=' + document.contentType + ' embed=' + !!document.querySelector('embed[type="application/pdf"]'));
    return found;
  }

  function extractPdfContent() {
    console.log('[PDF] extractPdfContent called, href=' + location.href);
    return new Promise(function(resolve, reject) {
      var timeout = setTimeout(function() { reject(new Error('PDF 提取超时')); }, 60000);
      var readyReceived = false;

      function onMessage(e) {
        if (e.data && e.data.type === '__PDF_RESULT') {
          clearTimeout(timeout);
          window.removeEventListener('message', onMessage);
          if (e.data.error) reject(new Error(e.data.error));
          else resolve(e.data.text);
        }
        if (e.data && e.data.type === '__PDF_READY') {
          readyReceived = true;
        }
      }
      window.addEventListener('message', onMessage);

      function doExtract() {
        var embed = document.querySelector('embed[type="application/pdf"]');
        var pdfUrl = (embed && embed.src && embed.src !== 'about:blank') ? embed.src : location.href;
        var proto = pdfUrl.split(':')[0];
        if (proto !== 'http' && proto !== 'https' && proto !== 'file') {
          clearTimeout(timeout);
          window.removeEventListener('message', onMessage);
          reject(new Error('不支持的协议: ' + proto));
          return;
        }

        console.log('[PDF] fetching via background: ' + pdfUrl);
        chrome.runtime.sendMessage({ type: 'fetchPdfFile', url: pdfUrl }, function(resp) {
          if (resp && resp.data) {
            var binary = atob(resp.data);
            var bytes = new Uint8Array(binary.length);
            for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            console.log('[PDF] got data from background, bytes=' + bytes.length);
            window.postMessage({ type: '__PDF_EXTRACT', data: bytes.buffer, pdfUrl: pdfUrl }, '*');
          } else {
            console.log('[PDF] background fetch failed: ' + (resp && resp.error));
            clearTimeout(timeout);
            window.removeEventListener('message', onMessage);
            reject(new Error('后台获取 PDF 失败: ' + (resp && resp.error || '未知错误')));
          }
        });
      }

      function waitReadyAndExtract() {
        if (readyReceived) { doExtract(); return; }
        var handler = function(e) {
          if (e.data && e.data.type === '__PDF_READY') {
            window.removeEventListener('message', handler);
            doExtract();
          }
        };
        window.addEventListener('message', handler);
      }

      if (document.getElementById('__pdf-reader-injected')) {
        doExtract();
      } else {
        chrome.runtime.sendMessage({ type: 'injectPdfReader' }, function(resp) {
          if (resp && resp.success) {
            waitReadyAndExtract();
          } else {
            clearTimeout(timeout);
            window.removeEventListener('message', onMessage);
            reject(new Error('注入 PDF 阅读器失败'));
          }
        });
      }
    });
  }

  function extractContent() {
    if (isPdfPage()) {
      return extractPdfContent();
    }
    return readAISettings().then(function(settings) {
      var maxChars = settings.pageContentMaxChars || 100000;
      var result;
      if (optimizer && optimizer.extractContent) {
        result = optimizer.extractContent();
      } else {
        result = extractPageContent(maxChars);
      }
      return result.then(function(content) {
        return content;
      });
    });
  }

  function refreshPageContent(showToastMsg) {
    pendingPageInject = true;
    extractContent().then(function(content) {
      if (!content) { showToast('无法获取页面内容'); return; }
      pageContentCache = content;
      var session = getCurrentSession();
      if (!session) return;
      updateSessionPageContent(session.id, content);
      updateQuickActions();
      if (showToastMsg) showToast('读取成功');
    });
  }

  function clearMessages() {
    var session = getCurrentSession();
    if (!session || !session.messages || session.messages.length === 0) return;
    if (!confirm('确定清空当前会话的聊天记录？')) return;
    session.messages = [];
    if (!optimizer || !optimizer.name || !optimizer.name.startsWith('Outlook')) {
      session.name = '新会话 ' + (sessionOrder.length + 1);
      renameSession(session.id, session.name);
    }
    setSessionMessages(session.id, session.messages);
    renderMessages();
    updateHeaderTitle();
    renderSessionList();
  }

  // === Quick actions ===
  function getDefaultQuickActions() {
    return [
      {
        id: 'summary',
        label: '总结页面',
        prompt: '请对当前页面内容进行中文摘要，突出重点信息：\n\n{content}'
      },
      {
        id: 'translate',
        label: '翻译',
        prompt: '请将当前页面内容翻译为{language}：\n\n{content}'
      }
    ];
  }

  function updateQuickActions() {
    if (htmlEditMode && window.__htmlEditor) {
      showEditorQuickActions();
      return;
    }
    quickActionsEl.innerHTML = '';
    var actions = null;
    var isOutlook = optimizer && optimizer.name && optimizer.name.startsWith('Outlook');
    if (optimizer && optimizer.getQuickActions) {
      actions = optimizer.getQuickActions();
    }
    if (!actions || actions.length === 0) {
      actions = getDefaultQuickActions();
    }
    readAISettings().then(function(settings) {
      var actionEnabled = {};
      var actionIds = isOutlook ? ['summary','reply','keypoints','translate'] : ['summary','translate'];
      var prefix = isOutlook ? 'outlook_' : 'default_';
      actionIds.forEach(function(id) {
        actionEnabled[id] = settings['actionEnabled_' + prefix + id] !== false;
      });
      var showActions = actions.filter(function(a) { return actionEnabled[a.id] !== false; });
      var allActions = showActions.concat(settings.customQuickActions || []);
      allActions.forEach(function(action) {
        var btn = document.createElement('button');
        btn.textContent = action.label;
        btn.addEventListener('click', function() { handleQuickAction(action); });
        quickActionsEl.appendChild(btn);
      });
    });
  }

  function handleQuickAction(action) {
    if (action.getPrompt) {
      showTyping();
      action.getPrompt().then(function(prompt) {
        removeTyping();
        inputEl.value = prompt;
        inputEl.style.height = 'auto';
        sendMessage(action.label);
      }).catch(function(err) {
        removeTyping();
        appendMessageDOM('assistant', '操作失败: ' + err.message);
        scrollToBottom();
      });
      return;
    }
    var content = pageContentCache || '';
    readAISettings().then(function(settings) {
      var userContent;
      if (action.id === 'reply') {
        var liveRecipient = optimizer && optimizer.getComposeRecipient ? optimizer.getComposeRecipient(settings.outlookReplyCcEnabled, settings.outlookReplyBccEnabled) : '';
        userContent = action.prompt.replace('{content}', content);
        userContent = userContent.replace('{language}', settings.translateLanguage || '中文');
        if (liveRecipient) {
          var recipientStr = liveRecipient.replace(/^收件人：/, '本次邮件回复收件人：');
          userContent = userContent.replace('{recipient}', recipientStr);
        } else {
          userContent = userContent.replace('{recipient}', '');
        }
        userContent = userContent.replace('{userInfo}', settings.outlookUserInfo || '');
        userContent = userContent.replace(/\n{3,}/g, '\n\n');
      } else {
        if (optimizer && optimizer.getComposeRecipient) {
          var liveRecipient = optimizer.getComposeRecipient(settings.outlookReplyCcEnabled, settings.outlookReplyBccEnabled);
          if (liveRecipient) {
            content = '当前写信收件人：' + liveRecipient + '\n\n' + content;
          }
        }
        userContent = action.prompt.replace('{content}', content);
        userContent = userContent.replace('{language}', settings.translateLanguage || '中文');
      }
      inputEl.value = '';
      inputEl.style.height = 'auto';

      var systemParts = [];
      if (optimizer && optimizer.getSystemPrompt) {
        var optPrompt = optimizer.name && optimizer.name.startsWith('Outlook') && settings.outlookSystemPrompt ? settings.outlookSystemPrompt : optimizer.getSystemPrompt();
        systemParts.push(optPrompt);
        if (optimizer.name && optimizer.name.startsWith('Outlook') && settings.outlookUserInfo && settings.outlookUserInfo.trim()) {
          systemParts.push('你的用户为【' + settings.outlookUserInfo.trim() + '】');
        }
      } else if (settings.systemPrompt) {
        systemParts.push(settings.systemPrompt);
      }

      appendMessageDOM('user', action.label);
      var session = getCurrentSession();
      if (session) {
        session.messages.push({ role: 'user', content: action.label, createdAt: Date.now() });
        setSessionMessages(session.id, session.messages);
      }
      scrollToBottom();

      var systemText = systemParts.join('\n\n');
      var messages = [{ role: 'system', content: systemText }, { role: 'user', content: userContent }];

      appendMessageDOM('assistant', '');
      scrollToBottom();
      var assistantEls = document.querySelectorAll('#ai-chat-messages .ai-chat-msg.assistant');
      var assistantDiv = assistantEls[assistantEls.length - 1];
      var contentDiv = assistantDiv && assistantDiv.querySelector('.ai-chat-msg-content');

      isStreaming = true;
      showDoneLoading();
      sendBtn.classList.add('sending');
      sendBtn.title = '停止';
      sendBtn.innerHTML = '<svg viewBox="0 0 16 16" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><rect x="3" y="3" width="10" height="10" rx="2"/></svg>';
      currentAbortController = new AbortController();

      callAI(settings, messages, function(data) {
        if (data.content && contentDiv) {
          updateLastAssistantMessage(data.content);
        }
      }, currentAbortController.signal, null).then(function(result) {
        flushPendingRender();
        if (result && result.content && contentDiv) {
          renderAssistantContent(contentDiv, result.content);
          if (session) {
          session.messages.push({ role: 'assistant', content: result.content, createdAt: Date.now() });
          setSessionMessages(session.id, session.messages);
        }
        }
        showDoneCheck();
        scrollToBottom();
      }).catch(function(err) {
        if (err && err.name === 'AbortError') { hideDoneBtn(); return; }
        hideDoneBtn();
        if (err && err.message && err.message !== 'aborted') console.error('[Hupilot] Quick action error:', err);
        if (contentDiv && err && err.message !== 'aborted') contentDiv.innerHTML = '<p style="color:red">请求失败：' + err.message + '</p>';
      }).finally(function() {
        isStreaming = false;
        sendBtn.classList.remove('sending');
        sendBtn.title = '发送';
        sendBtn.innerHTML = '<svg viewBox="0 0 16 16" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><polygon points="2 2 14 8 2 14 4.5 8 2 2"/></svg>';
        currentAbortController = null;
      });
    })

      .catch(function() {});
  }

  // === Session management ===
  var currentDomainKey = '';
  var currentFullUrl = '';

  function loadPageContent() {
    extractContent().then(function(content) {
      if (content) {
        pageContentCache = content;
        var session = getCurrentSession();
        if (session) updateSessionPageContent(session.id, content);
        updateQuickActions();
      }
    });
  }

  function loadCurrentSession() {
    var url = window.location.href;
    currentDomainKey = getDomainKey(url);
    currentFullUrl = url;
    initSessions(url).then(function() {
      return createSession(url, optimizer && optimizer.name).then(function() {
        renderSessionList(); renderMessages(); updateHeaderTitle(); loadPageContent(); updateSearchToggle(); updateShellToggle();
      });
    }).catch(function(e) {
      console.log('[AI] init sessions error:', e);
    });
  }

  function handleUrlChange() {
    if (!sidebarOpen) return;
    var url = window.location.href;
    if (url === currentFullUrl) return;
    currentFullUrl = url;
    optimizer = getOptimizer(url);
    if (isStreaming) { stopAI(); isStreaming = false; removeTyping(); }
    exitWebQaMode();
    var subBtn = document.getElementById('ai-chat-bili-subtitle-btn');
    if (subBtn) subBtn.style.display = (/bilibili\.com\/video\//.test(url)) ? '' : 'none';
    var ytSubBtn = document.getElementById('ai-chat-yt-subtitle-btn');
    if (ytSubBtn) ytSubBtn.style.display = (/youtube\.com/.test(url)) ? '' : 'none';
    window.postMessage({type: 'ytClearSubtitleCache'}, '*');
    var domainKey = getDomainKey(url);
    var isVideoPage = /bilibili\.com\/video\//.test(url) || /youtube\.com\/(watch\?|shorts\/)/.test(url);
    if (domainKey !== currentDomainKey) {
      currentDomainKey = domainKey;
      createSession(url, optimizer && optimizer.name).then(function(sid) {
        if (!sid) return;
        showChatView(); renderSessionList(); renderMessages(); updateHeaderTitle(); updateSearchToggle(); updateShellToggle();
        setTimeout(refreshPageContent, 600);
      });
    } else if (isVideoPage) {
      createSession(url, optimizer && optimizer.name).then(function(sid) {
        if (!sid) return;
        showChatView(); renderSessionList(); renderMessages(); updateHeaderTitle(); updateSearchToggle(); updateShellToggle();
        setTimeout(refreshPageContent, 600);
      });
    } else {
      if (optimizer && optimizer.onUrlChange) {
        var session = getCurrentSession();
        if (session && session.messages.length > 0) {
          session.contextStartIndex = session.messages.length;
          saveSessions();
          renderMessages();
        }
      }
      setTimeout(refreshPageContent, 600);
    }
  }

  function renderSessionList() {
    var sessions = listSessions();
    sessionListEl.innerHTML = '';
    sessions.forEach(function(session, index) {
      var item = document.createElement('div');
      item.className = 'ai-chat-session-item' + (session.id === currentSessionId ? ' active' : '');
      item.dataset.id = session.id;
      if (sessionEditMode) {
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'session-checkbox';
        cb.value = session.id;
        item.appendChild(cb);
        item.addEventListener('click', function(e) {
          if (e.target === cb) return;
          cb.checked = !cb.checked;
        });
      }
      var idxSpan = document.createElement('span');
      idxSpan.className = 'session-index';
      idxSpan.textContent = (index + 1) + '.';
      item.appendChild(idxSpan);
      var nameSpan = document.createElement('span');
      nameSpan.className = 'session-name';
      nameSpan.textContent = session.name || '未命名';
      item.appendChild(nameSpan);
      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'session-delete';
      deleteBtn.innerHTML = '<svg viewBox="0 0 16 16" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><polyline points="2 4 4 4 14 4"/><path d="M4 4V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v1"/><path d="M6 7v5"/><path d="M10 7v5"/><path d="M3 4l1 9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-9"/></svg>';
      deleteBtn.title = '删除会话';
      deleteBtn.addEventListener('click', function(e) { e.stopPropagation(); handleDeleteSession(session.id); });
      deleteBtn.classList.toggle('hidden', sessionEditMode);
      item.appendChild(deleteBtn);
      item.addEventListener('click', function() { if (!sessionEditMode) handleSwitchSession(session.id); });
      item.addEventListener('dblclick', function() { if (!sessionEditMode) startRename(session.id, nameSpan); });
      sessionListEl.appendChild(item);
    });
  }

  function startRename(id, nameEl) {
    if (nameEl.contentEditable === 'true') return;
    var oldText = nameEl.textContent;
    nameEl.contentEditable = true;
    nameEl.classList.add('editing');
    nameEl.focus();
    var range = document.createRange();
    range.selectNodeContents(nameEl);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    function finish() {
      nameEl.contentEditable = false;
      nameEl.classList.remove('editing');
      var newName = nameEl.textContent.trim() || oldText;
      nameEl.textContent = newName;
      renameSession(id, newName).then(function() { renderSessionList(); updateHeaderTitle(); });
    }
    function cancel() {
      nameEl.contentEditable = false;
      nameEl.classList.remove('editing');
      nameEl.textContent = oldText;
    }
    nameEl.addEventListener('blur', finish, {once: true});
    nameEl.addEventListener('keydown', function handler(e) {
      if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
      if (e.key === 'Escape') { cancel(); }
    }, {once: true});
  }

  function handleSwitchSession(id) {
    switchSession(id).then(function() {
      renderSessionList(); renderMessages(); updateHeaderTitle(); showChatView();
    });
  }

  function handleDeleteSession(id) {
    if (!confirm('确定删除此会话？')) return;
    deleteSession(id).then(function() { renderSessionList(); renderMessages(); updateHeaderTitle(); });
  }

  function handleNewSession() {
    createSession(window.location.href, optimizer && optimizer.name).then(function() {
      if (pageContentCache) updateSessionPageContent(currentSessionId, pageContentCache);
      renderSessionList(); renderMessages(); updateHeaderTitle(); showChatView();
    });
  }

  function toggleSessionEditMode() {
    sessionEditMode = !sessionEditMode;
    renderSessionList();
    var editBtn = document.getElementById('ai-chat-session-edit-btn');
    var batchBar = document.getElementById('ai-chat-session-batch-bar');
    editBtn.textContent = sessionEditMode ? '完成' : '编辑';
    batchBar.classList.toggle('hidden', !sessionEditMode);
  }

  function selectAllSessions() {
    var cbs = document.querySelectorAll('#ai-chat-session-list .session-checkbox');
    var allChecked = true;
    cbs.forEach(function(cb) { if (!cb.checked) allChecked = false; });
    cbs.forEach(function(cb) { cb.checked = !allChecked; });
  }

  function deleteSelectedSessions() {
    var cbs = document.querySelectorAll('#ai-chat-session-list .session-checkbox:checked');
    if (cbs.length === 0) return;
    if (!confirm('确定删除选中的 ' + cbs.length + ' 个会话？')) return;
    var ids = [];
    cbs.forEach(function(cb) { ids.push(cb.value); });
    var promises = ids.map(function(id) { return deleteSession(id); });
    Promise.all(promises).then(function() {
      if (sessionEditMode) toggleSessionEditMode();
      renderSessionList(); renderMessages(); updateHeaderTitle();
    });
  }

  var _prevSessionId = null;

  function toggleWebQaMode() {
    webQaMode = !webQaMode;
    if (webQaMode) {
      _prevSessionId = currentSessionId;
      createSession(window.location.href, '联网问答模式').then(function() {
        if (pageContentCache) updateSessionPageContent(currentSessionId, pageContentCache);
        var session = getCurrentSession();
        if (session) session.webSearchEnabled = true;
        saveSessions();
        renderSessionList(); renderMessages(); updateHeaderTitle(); showChatView();
        updateWebQaUI();
      });
    } else {
      if (_prevSessionId && getSession(_prevSessionId)) {
        switchSession(_prevSessionId).then(function() {
          _prevSessionId = null;
          renderSessionList(); renderMessages(); updateHeaderTitle(); showChatView();
          updateWebQaUI();
        });
      } else {
        var session = getCurrentSession();
        if (session) {
          session.webSearchEnabled = false;
          saveSessions();
        }
        updateWebQaUI();
      }
    }
  }

  function exitWebQaMode() {
    if (!webQaMode) return;
    webQaMode = false;
    if (_prevSessionId && getSession(_prevSessionId)) {
      switchSession(_prevSessionId).then(function() {
        _prevSessionId = null;
        renderSessionList(); renderMessages(); updateHeaderTitle(); showChatView();
        updateWebQaUI();
      });
    } else {
      var session = getCurrentSession();
      if (session) {
        session.webSearchEnabled = false;
        saveSessions();
      }
      updateWebQaUI();
    }
  }

  function updateWebQaUI() {
    var btn = document.getElementById('ai-chat-webqa-btn');
    if (!btn) return;
    var searchToggle = document.getElementById('ai-chat-search-toggle');
    var searchProvider = document.getElementById('ai-chat-search-provider');
    var quickActions = document.getElementById('ai-chat-quick-actions');
    var browserBtn = document.getElementById('ai-chat-browser-btn');
    var welcomeText = document.getElementById('ai-chat-welcome-text');
    var welcomeHint = document.getElementById('ai-chat-welcome-hint');
    if (webQaMode) {
      btn.textContent = '退出联网问答模式';
      btn.title = '退出联网问答模式，恢复页面内容识别';
      btn.classList.add('active');
      if (searchToggle) searchToggle.style.display = 'none';
      if (searchProvider) searchProvider.style.display = '';
      if (quickActions) quickActions.style.display = 'none';
      if (browserBtn) browserBtn.style.display = 'none';
      if (welcomeText) welcomeText.textContent = '此模式为联网问答专属强化模式，不再识别网页内容。';
      if (welcomeHint) welcomeHint.textContent = '输入问题，虎宝将联网搜索后回答';
    } else {
      btn.textContent = '联网问答模式';
      btn.title = '此模式下不识别当前网页内容';
      btn.classList.remove('active');
      if (searchToggle) searchToggle.style.display = '';
      if (searchProvider) searchProvider.style.display = 'none';
      if (quickActions) quickActions.style.display = '';
      if (browserBtn) browserBtn.style.display = browserControlEnabled ? '' : 'none';
      updateSearchToggle(); updateShellToggle();
      if (welcomeText) welcomeText.textContent = '我是虎宝，快和我说话吧。';
      if (welcomeHint) {
        welcomeHint.textContent = '输入问题开始对话';
        welcomeHint.style.textAlign = '';
      }
    }
  }

  function updateHeaderTitle() {
    var session = getCurrentSession();
    headerTitle.textContent = session ? session.name : 'Hupilot';
  }

  function startHeaderRename() {
    if (headerTitle.contentEditable === 'true') return;
    var session = getCurrentSession();
    if (!session) return;
    var oldName = headerTitle.textContent;
    headerTitle.contentEditable = true;
    headerTitle.classList.add('editing');
    headerTitle.focus();
    var range = document.createRange();
    range.selectNodeContents(headerTitle);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    function finish() {
      headerTitle.contentEditable = false;
      headerTitle.classList.remove('editing');
      var newName = headerTitle.textContent.trim() || oldName;
      headerTitle.textContent = newName;
      if (newName !== oldName) {
        renameSession(session.id, newName).then(function() { renderSessionList(); });
      }
    }
    function cancel() {
      headerTitle.contentEditable = false;
      headerTitle.classList.remove('editing');
      headerTitle.textContent = oldName;
    }
    headerTitle.addEventListener('blur', finish, {once: true});
    headerTitle.addEventListener('keydown', function handler(e) {
      if (e.key === 'Enter') { e.preventDefault(); headerTitle.blur(); }
      if (e.key === 'Escape') { cancel(); }
    }, {once: true});
  }

  // === View management ===
  function hideAllViews() {
    if (chatView) chatView.classList.add('hidden');
    if (sessionView) sessionView.classList.remove('visible');
    if (settingsView) settingsView.classList.remove('visible');
  }

  function showChatView() {
    hideAllViews();
    if (!chatView) return;
    chatView.classList.remove('hidden');
    var hdr = document.getElementById('ai-chat-header-actions');
    if (hdr) hdr.classList.remove('settings-active');
    var toggleBtn = document.getElementById('ai-chat-view-toggle');
    if (toggleBtn) toggleBtn.innerHTML = '<svg viewBox="0 0 20 20" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></svg>';
    updateSearchToggle(); updateShellToggle(); updateWebQaUI();
  }

  function updateSearchToggle() {
    var btn = document.getElementById('ai-chat-search-toggle');
    if (!btn) return;
    var session = getCurrentSession();
    var enabled = session && session.webSearchEnabled;
    btn.classList.toggle('ai-chat-search-off', !enabled);
    btn.classList.toggle('ai-chat-search-on', !!enabled);
  }

  var shellMasterEnabled = false;

  function updateShellToggle() {
    var btn = document.getElementById('ai-chat-shell-toggle');
    if (!btn) return;
    if (!shellMasterEnabled) {
      btn.style.display = 'none';
      return;
    }
    var session = getCurrentSession();
    var enabled = session && session.shellHostEnabled;
    btn.style.display = '';
    btn.classList.toggle('ai-chat-shell-off', !enabled);
    btn.classList.toggle('ai-chat-shell-on', !!enabled);
  }

  function showSessionView() {
    hideAllViews();
    if (sessionEditMode) toggleSessionEditMode();
    sessionView.classList.add('visible');
    document.getElementById('ai-chat-header-actions').classList.remove('settings-active');
    renderSessionList();
    document.getElementById('ai-chat-view-toggle').innerHTML = '<svg viewBox="0 0 20 20" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><polyline points="13 4 6 10 13 16"/></svg>';
  }

  function showSettingsView() {
    hideAllViews();
    settingsView.classList.add('visible');
    loadSettingsIntoForm();
    document.getElementById('ai-chat-header-actions').classList.add('settings-active');
    document.getElementById('ai-chat-view-toggle').innerHTML = '<svg viewBox="0 0 20 20" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><polyline points="13 4 6 10 13 16"/></svg>';
    initSettingsNav();
  }

  function showApiKeyModal() {
    var overlay = document.createElement('div');
    overlay.id = 'ai-chat-api-key-modal';
    overlay.innerHTML =
      '<div class="ai-chat-modal-content">' +
        '<p>请选择模型供应商并填入API Key。若没有API Key，请选择免费模型供应商，按获取按钮，注册账户，创建免费API Key填入即可使用完整功能。</p>' +
        '<div style="text-align:center"><button id="ai-chat-modal-confirm">确认</button></div>' +
      '</div>';
    sidebar.appendChild(overlay);
    document.getElementById('ai-chat-modal-confirm').addEventListener('click', function() {
      overlay.remove();
    });
  }

  var _settingsNavReady = false;
  var _navClickScroll = false;

  function initSettingsNav() {
    if (_settingsNavReady) return;
    var nav = document.getElementById('ai-chat-settings-nav');
    var scrollEl = document.querySelector('.ai-chat-settings-scroll');
    if (!nav || !scrollEl) return;
    nav.addEventListener('click', function(e) {
      var li = e.target.closest('li');
      if (!li) return;
      var target = document.getElementById(li.dataset.target);
      if (target) {
        nav.querySelectorAll('li').forEach(function(l) { l.classList.remove('active'); });
        li.classList.add('active');
        _navClickScroll = true;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(function() { _navClickScroll = false; }, 350);
      }
    });
    var sections = scrollEl.querySelectorAll('.ai-chat-settings-section');
    function updateActive() {
      if (_navClickScroll) return;
      var scrollTop = scrollEl.scrollTop;
      var active = sections[0];
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].offsetTop <= scrollTop + 10) {
          active = sections[i];
        }
      }
      var id = active.querySelector('h4').id;
      nav.querySelectorAll('li').forEach(function(l) {
        l.classList.toggle('active', l.dataset.target === id);
      });
    }
    scrollEl.addEventListener('scroll', updateActive);
    updateActive();
    _settingsNavReady = true;
  }

  function toggleView() {
    if (settingsView.classList.contains('visible') || sessionView.classList.contains('visible')) {
      showChatView();
    } else {
      showSessionView();
    }
  }

  // === Settings form ===
  var AI_LANGUAGES = ['中文', 'English', '日本語', '한국어', 'Français', 'Deutsch', 'Español', 'Русский'];
  var AI_LANG_CUSTOM = '__custom__';
  var AI_TTS_VOICES = [
    { id: 'zh-CN-XiaoyouNeural', label: '晓悠（中文普通话，增强模式可用）' },
    { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓（中文普通话）' },
    { id: 'zh-CN-XiaoyiNeural', label: '晓伊（中文普通话）' },
    { id: 'zh-CN-YunjianNeural', label: '云健（中文普通话）' },
    { id: 'zh-CN-YunxiNeural', label: '云希（中文普通话）' },
    { id: 'zh-CN-YunxiaNeural', label: '云夏（中文普通话）' },
    { id: 'zh-CN-YunyangNeural', label: '云扬（中文普通话）' },
    { id: 'zh-CN-liaoning-XiaobeiNeural', label: '晓北（中文东北话）' },
    { id: 'zh-CN-shaanxi-XiaoniNeural', label: '晓妮（中文中原话）' },
    { id: 'zh-HK-HiuGaaiNeural', label: '晓佳（粤语）' },
    { id: 'zh-HK-HiuMaanNeural', label: '晓曼（粤语）' },
    { id: 'zh-HK-WanLungNeural', label: '云龙（粤语）' },
    { id: 'zh-TW-HsiaoChenNeural', label: '晓臻（中文台湾）' },
    { id: 'zh-TW-HsiaoYuNeural', label: '晓雨（中文台湾）' },
    { id: 'zh-TW-YunJheNeural', label: '云哲（中文台湾）' },
    { id: 'ja-JP-KeitaNeural', label: 'Keita（日语）' },
    { id: 'ja-JP-NanamiNeural', label: 'Nanami（日语）' },
    { id: 'en-US-AnaNeural', label: 'Ana（英语）' },
    { id: 'en-US-AndrewMultilingualNeural', label: 'Andrew（英语多语言）' }
  ];
  var AI_TTS_VOICE_CUSTOM = '__tts_custom__';

  function showApiKeyForProvider(providerId) {
    var rows = document.querySelectorAll('.ai-chat-settings-apikey-row');
    for (var ri = 0; ri < rows.length; ri++) {
      rows[ri].style.display = rows[ri].dataset.provider === providerId ? '' : 'none';
    }
  }

  function initSettingsForm() {
    var FREE_PROVIDERS = { agnes: 1, kilocode: 1 };
    var providerEl = document.getElementById('ai-chat-settings-provider');
    var html = '';
    for (var key in AI_PROVIDERS) {
      var displayName = AI_PROVIDERS[key].name + (FREE_PROVIDERS[key] ? '（目前免费）' : '');
      html += '<option value="' + key + '">' + displayName + '</option>';
    }
    providerEl.innerHTML = html;

    // Language dropdown
    var langEl = document.getElementById('ai-chat-settings-lang');
    var langHtml = '';
    AI_LANGUAGES.forEach(function(l) { langHtml += '<option value="' + l + '">' + l + '</option>'; });
    langHtml += '<option value="' + AI_LANG_CUSTOM + '">自定义...</option>';
    langEl.innerHTML = langHtml;

    // Per-provider API key rows
    var PROVIDER_KEY_URLS = {
      deepseek: 'https://platform.deepseek.com/api_keys',
      sensenova: 'https://platform.sensenova.cn/console/keys',
      mimo: 'https://platform.xiaomimimo.com?ref=65JEF8',
      kilocode: 'https://app.kilo.ai/profile',
      agnes: 'https://platform.agnes-ai.com/settings/apiKeys'
    };
    var keysContainer = document.getElementById('ai-chat-settings-apikey-rows');
    var keyHtml = '';
    for (var pid in AI_PROVIDERS) {
      var p = AI_PROVIDERS[pid];
      var keyUrl = PROVIDER_KEY_URLS[pid];
      var shortName = p.name.replace(/（.*?）/g, '');
      keyHtml +=
        '<div class="ai-chat-settings-row ai-chat-settings-apikey-row" data-provider="' + pid + '">' +
          '<label>' + shortName + ' API Key' + (keyUrl ? ' <a href="' + keyUrl + '" target="_blank" style="margin-left:4px">获取</a>' : '') + '</label>' +
          '<div class="ai-chat-settings-key-row">' +
            '<input type="password" class="ai-chat-settings-apikey-input" data-provider="' + pid + '" autocomplete="new-password" placeholder="输入 ' + shortName + ' API Key">' +
            '<button class="ai-chat-settings-togglekey" data-provider="' + pid + '">显示</button>' +
          '</div>' +
        '</div>';
    }
    keysContainer.innerHTML = keyHtml;

    keysContainer.addEventListener('click', function(e) {
      var btn = e.target.closest('.ai-chat-settings-togglekey');
      if (!btn) return;
      var pid = btn.dataset.provider;
      var el = keysContainer.querySelector('.ai-chat-settings-apikey-input[data-provider="' + pid + '"]');
      if (el.type === 'password') { el.type = 'text'; btn.textContent = '隐藏'; }
      else { el.type = 'password'; btn.textContent = '显示'; }
    });

    // Events
    providerEl.addEventListener('change', function() {
      updateSettingsModels();
      var p = AI_PROVIDERS[providerEl.value];
      if (p) document.getElementById('ai-chat-settings-baseurl').value = p.baseUrl;
      showApiKeyForProvider(providerEl.value);
      updateThinkingUI();
    });

    document.getElementById('ai-chat-settings-model').addEventListener('change', function() {
      if (this.value === AI_MODEL_CUSTOM) {
        this.style.display = 'none';
        document.getElementById('ai-chat-settings-model-custom').style.display = '';
        document.getElementById('ai-chat-settings-model-custom').focus();
        document.getElementById('ai-chat-settings-model-back').style.display = '';
      }
    });

    // TTS voice dropdown
    var ttsVoicesHtml = '';
    AI_TTS_VOICES.forEach(function(v) {
      ttsVoicesHtml += '<option value="' + v.id + '">' + v.label + '</option>';
    });
    ttsVoicesHtml += '<option value="' + AI_TTS_VOICE_CUSTOM + '">自定义...</option>';
    document.getElementById('ai-chat-settings-tts-voice').innerHTML = ttsVoicesHtml;

    document.getElementById('ai-chat-settings-tts-voice').addEventListener('change', function() {
      if (this.value === AI_TTS_VOICE_CUSTOM) {
        this.style.display = 'none';
        document.getElementById('ai-chat-settings-tts-voice-custom').style.display = '';
        document.getElementById('ai-chat-settings-tts-voice-custom').focus();
        document.getElementById('ai-chat-settings-tts-voice-back').style.display = '';
        document.getElementById('ai-chat-settings-tts-engine-links').style.display = '';
      }
    });
    document.getElementById('ai-chat-settings-tts-voice-back').addEventListener('click', function(e) {
      e.preventDefault();
      document.getElementById('ai-chat-settings-tts-voice-custom').style.display = 'none';
      this.style.display = 'none';
      document.getElementById('ai-chat-settings-tts-engine-links').style.display = 'none';
      var sel = document.getElementById('ai-chat-settings-tts-voice');
      sel.style.display = '';
      sel.value = AI_TTS_VOICES[0].id;
    });

    document.getElementById('ai-chat-settings-tts-enabled').addEventListener('change', function() {
      var show = this.checked;
      document.getElementById('ai-chat-settings-tts-voice-row').style.display = show ? '' : 'none';
      document.getElementById('ai-chat-settings-tts-rate-row').style.display = show ? '' : 'none';
      document.getElementById('ai-chat-settings-tts-hint').style.display = show ? '' : 'none';
    });

    document.getElementById('ai-chat-settings-thinking').addEventListener('change', function() {
      updateThinkingUI();
    });

    document.querySelector('.ai-chat-settings-togglekey-tavily').addEventListener('click', function() {
      var el = document.getElementById('ai-chat-settings-tavily-key');
      if (el.type === 'password') { el.type = 'text'; this.textContent = '隐藏'; }
      else { el.type = 'password'; this.textContent = '显示'; }
    });

    document.querySelector('.ai-chat-settings-togglekey-baidu').addEventListener('click', function() {
      var el = document.getElementById('ai-chat-settings-baidu-key');
      if (el.type === 'password') { el.type = 'text'; this.textContent = '隐藏'; }
      else { el.type = 'password'; this.textContent = '显示'; }
    });

    document.querySelector('.ai-chat-settings-togglekey-anysearch').addEventListener('click', function() {
      var el = document.getElementById('ai-chat-settings-anysearch-key');
      if (el.type === 'password') { el.type = 'text'; this.textContent = '隐藏'; }
      else { el.type = 'password'; this.textContent = '显示'; }
    });

    var rateRange = document.getElementById('ai-chat-settings-tts-rate');
    var rateVal = document.getElementById('ai-chat-settings-tts-rate-val');
    rateRange.addEventListener('input', function() {
      rateVal.value = parseFloat(this.value).toFixed(2);
    });
    rateVal.addEventListener('input', function() {
      var v = parseFloat(this.value);
      if (isNaN(v)) return;
      if (v < 0.5) v = 0.5;
      if (v > 2.0) v = 2.0;
      rateRange.value = v;
    });

    document.getElementById('ai-chat-settings-save').addEventListener('click', function(e) {
      e.preventDefault();
      saveSettingsFromForm();
    });

    var headerSaveBtn = document.getElementById('ai-chat-header-save-btn');
    if (headerSaveBtn) {
      headerSaveBtn.addEventListener('click', function(e) {
        saveSettingsFromForm();
      });
    }

    // Reset prompt buttons
    document.querySelectorAll('.ai-chat-reset-prompt').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = document.getElementById(this.dataset.target);
        if (target) {
          target.value = this.dataset.default;
          // Immediately sync localStorage so bubble text takes effect without saving
          var id = target.id;
          if (id === 'ai-chat-settings-deskpet-texts') {
            var lines = target.value.split('\n').filter(Boolean);
            if (lines.length > 0) localStorage.setItem('hupilot_tc', JSON.stringify(lines));
            else localStorage.removeItem('hupilot_tc');
          } else if (id === 'ai-chat-settings-sleep-texts') {
            var lines = target.value.split('\n').filter(Boolean);
            if (lines.length > 0) localStorage.setItem('hupilot_stc', JSON.stringify(lines));
            else localStorage.removeItem('hupilot_stc');
          }
        }
      });
    });
  }

  function updateThinkingUI() {
    var provider = document.getElementById('ai-chat-settings-provider').value;
    var checkbox = document.getElementById('ai-chat-settings-thinking');
    var group = document.getElementById('ai-chat-settings-reasoning-group');
    if (provider === 'custom') {
      checkbox.disabled = true;
      group.style.display = 'none';
    } else if (provider === 'mimo') {
      checkbox.disabled = false;
      group.style.display = 'none';
    } else {
      checkbox.disabled = false;
      group.style.display = checkbox.checked ? '' : 'none';
    }
  }

  function updateSettingsModels() {
    var provider = AI_PROVIDERS[document.getElementById('ai-chat-settings-provider').value];
    var sel = document.getElementById('ai-chat-settings-model');
    if (!provider) return;
    var html = '';
    provider.models.forEach(function(m) { html += '<option value="' + m + '">' + m + '</option>'; });
    html += '<option value="' + AI_MODEL_CUSTOM + '">自定义...</option>';
    sel.innerHTML = html;
    if (provider.models.length === 0) {
      sel.style.display = 'none';
      document.getElementById('ai-chat-settings-model-custom').style.display = '';
      document.getElementById('ai-chat-settings-model-back').style.display = 'none';
    } else {
      sel.style.display = '';
      document.getElementById('ai-chat-settings-model-custom').style.display = 'none';
      document.getElementById('ai-chat-settings-model-back').style.display = 'none';
    }
  }

  function loadSettingsIntoForm() {
    readAISettings().then(function(s) {
      document.getElementById('ai-chat-settings-provider').value = s.provider || 'sensenova';
      document.getElementById('ai-chat-settings-provider').dataset.prevProvider = s.provider || 'deepseek';
      updateSettingsModels();

      var provider = AI_PROVIDERS[s.provider];
      var isCustom = true;
      if (provider) {
        for (var i = 0; i < provider.models.length; i++) {
          if (provider.models[i] === s.model) {
            document.getElementById('ai-chat-settings-model').value = s.model;
            isCustom = false; break;
          }
        }
      }
      if (isCustom && s.model) {
        var sel = document.getElementById('ai-chat-settings-model');
        sel.value = AI_MODEL_CUSTOM;
        sel.style.display = 'none';
        document.getElementById('ai-chat-settings-model-custom').style.display = '';
        document.getElementById('ai-chat-settings-model-custom').value = s.model;
        document.getElementById('ai-chat-settings-model-back').style.display = '';
      }

      document.getElementById('ai-chat-settings-baseurl').value = s.baseUrl || '';

      // Migration: old single apiKey → sensenova providerKeys
      if (s.apiKey && (!s.providerKeys || Object.keys(s.providerKeys).length === 0)) {
        s.providerKeys = s.providerKeys || {};
        s.providerKeys.sensenova = s.apiKey;
      }
      var keysContainer = document.getElementById('ai-chat-settings-apikey-rows');
      var inputs = keysContainer.querySelectorAll('.ai-chat-settings-apikey-input');
      for (var ki = 0; ki < inputs.length; ki++) {
        var inp = inputs[ki];
        inp.value = (s.providerKeys || {})[inp.dataset.provider] || '';
      }
      showApiKeyForProvider(s.provider);
      document.getElementById('ai-chat-settings-prompt').value = s.systemPrompt || '';
          document.getElementById('ai-chat-settings-history').value = s.maxHistoryRounds !== undefined ? s.maxHistoryRounds : 6;
      document.getElementById('ai-chat-settings-max-sessions').value = s.maxSessions || 50;
      document.getElementById('ai-chat-settings-content-limit').value = s.pageContentMaxChars !== undefined ? s.pageContentMaxChars : 100000;
      document.getElementById('ai-chat-settings-thinking').checked = s.thinkingMode || false;
      updateThinkingUI();
      document.getElementById('ai-chat-settings-reasoning').value = s.reasoningEffort || 'medium';
      ['default_summary','default_translate','outlook_summary','outlook_reply','outlook_keypoints','outlook_translate'].forEach(function(id) {
        document.getElementById('ai-chat-settings-action-' + id).checked = s['actionEnabled_' + id] !== false;
      });
      document.getElementById('ai-chat-settings-outlook-prompt').value = s.outlookSystemPrompt || '你的名字叫虎宝，你是一个邮件助手，可以帮助用户处理邮件，并给用户提供管理上的帮助和支持。请基于邮件内容给出准确、专业的回答，并给出管理视角的专业建议和提醒。';
      document.getElementById('ai-chat-settings-outlook-userinfo').value = s.outlookUserInfo || '';
      document.getElementById('ai-chat-settings-outlook-reply-prompt').value = s.outlookReplyPrompt || '你的名字叫虎宝，你是一个邮件助手。请基于邮件内容给出准确、专业的回答。不要使用markdown格式，直接输出纯文本。';
      document.getElementById('ai-chat-settings-outlook-reply-btn').checked = s.outlookReplyBtn !== false;
      document.getElementById('ai-chat-settings-outlook-reply-plus-btn').checked = s.outlookReplyPlusBtn !== false;
      document.getElementById('ai-chat-settings-outlook-reply-cc').checked = s.outlookReplyCcEnabled !== false;
      document.getElementById('ai-chat-settings-outlook-reply-bcc').checked = s.outlookReplyBccEnabled === true;
      document.getElementById('ai-chat-settings-webqa-prompt').value = s.webQaSystemPrompt || '你的名字叫虎宝，你是一个专业的联网问答助手。你可以通过搜索工具联网获取最新信息来回答用户的问题。请充分利用搜索工具查询实时信息，并基于搜索结果给出全面、准确、结构化的回答。如果搜索结果不足以回答问题，请如实告知用户。不要编造信息，所有回答必须基于搜索结果。';
      document.getElementById('ai-chat-settings-darkmode').value = s.darkMode || 'system';
      document.getElementById('ai-chat-settings-selection-popup').checked = s.selectionPopup !== false;
      document.getElementById('ai-chat-settings-deskpet').checked = s.deskPetAlways === true;
      document.getElementById('ai-chat-settings-deskpet-texts').value = s.deskPetTexts || '我饿了\n休息一下吧\n陪我玩一会儿\n工作辛苦了\n下午茶时间\n散步时间\n我要吃肉！\n我是一只小老虎\n嗷呜~嗷呜~';
      try {
        var lines = (s.deskPetTexts || '').split('\n').filter(Boolean);
        if (lines.length > 0) localStorage.setItem('hupilot_tc', JSON.stringify(lines));
        else localStorage.removeItem('hupilot_tc');
      } catch(e) {};
      document.getElementById('ai-chat-settings-deskpet-interval').value = s.deskPetInterval || 2;
    document.getElementById('ai-chat-settings-deskpet-duration').value = s.deskPetDuration || 5;
      try {
        localStorage.setItem('hupilot_dr', s.deskPetDuration || 5);
      } catch(e) {}
      var petSize = s.petSize || 'large';
      var sizeRadio = document.querySelector('input[name="petSize"][value="' + petSize + '"]');
      if (sizeRadio) { sizeRadio.checked = true; applyPetBtnSize(petSize); }
      // Sleep mode
      document.getElementById('ai-chat-settings-sleep-timeout').value = s.sleepTimeout !== undefined ? s.sleepTimeout : 3;
      document.getElementById('ai-chat-settings-sleep-texts').value = s.sleepTexts || '好多肉\n真好吃\nz  z  z\n吃不下了\n再睡一会儿';
      try {
        var sleepLines = (s.sleepTexts || '好多肉\n真好吃\nz  z  z\n吃不下了\n再睡一会儿').split('\n').filter(Boolean);
        if (sleepLines.length > 0) localStorage.setItem('hupilot_stc', JSON.stringify(sleepLines));
        else localStorage.removeItem('hupilot_stc');
        if (s.sleepTimeout !== undefined) localStorage.setItem('hupilot_st', s.sleepTimeout);
      } catch(e) {}
      // Reminders
      document.getElementById('ai-chat-settings-reminder-enabled').checked = s.reminderEnabled === true;
      var remindersList = document.getElementById('ai-chat-settings-reminders-list');
      remindersList.innerHTML = '';
      (s.reminders || []).forEach(function(r) {
        remindersList.appendChild(createReminderRow(r));
      });
      // Experimental
      document.getElementById('ai-chat-settings-exp-web-edit').checked = s.experimentalWebEdit === true;
      document.getElementById('ai-chat-settings-exp-page-translate').checked = s.pageTranslation === true;
      var bilingualRow = document.getElementById('ai-chat-settings-bilingual-row');
      if (bilingualRow) bilingualRow.style.display = s.pageTranslation ? '' : 'none';
      document.getElementById('ai-chat-settings-page-bilingual').checked = s.pageTranslateBilingual === true;
      var bilingualStyleRow = document.getElementById('ai-chat-settings-bilingual-style-row');
      if (bilingualStyleRow) bilingualStyleRow.style.display = s.pageTranslation && s.pageTranslateBilingual ? '' : 'none';
      document.getElementById('ai-chat-settings-bilingual-style').value = s.pageTranslateBilingualStyle || 'background';
      // 翻译功能开关变化时显示/隐藏双语选项
      var ptCb = document.getElementById('ai-chat-settings-exp-page-translate');
      if (ptCb && !ptCb._bilingualListener) {
        ptCb._bilingualListener = true;
        ptCb.addEventListener('change', function() {
          var bilingualRow = document.getElementById('ai-chat-settings-bilingual-row');
          if (bilingualRow) bilingualRow.style.display = this.checked ? '' : 'none';
          var bilingualStyleRow = document.getElementById('ai-chat-settings-bilingual-style-row');
          if (bilingualStyleRow) bilingualStyleRow.style.display = this.checked && document.getElementById('ai-chat-settings-page-bilingual').checked ? '' : 'none';
        });
      }
      // 双语开关变化时显示/隐藏样式选择
      var bilingualCb = document.getElementById('ai-chat-settings-page-bilingual');
      if (bilingualCb && !bilingualCb._styleListener) {
        bilingualCb._styleListener = true;
        bilingualCb.addEventListener('change', function() {
          var bilingualStyleRow = document.getElementById('ai-chat-settings-bilingual-style-row');
          if (bilingualStyleRow) bilingualStyleRow.style.display = this.checked ? '' : 'none';
          if (!this.checked && ptState === 'translated') restorePageText();
          chrome.storage.local.get('aiSettings', function(r) {
            var s = r.aiSettings || {};
            s.pageTranslateBilingual = bilingualCb.checked;
            chrome.storage.local.set({ aiSettings: s });
          });
        });
      }
      // Confirm dialog when turning on experimental web edit
      if (!document.getElementById('ai-chat-settings-exp-web-edit')._listenerAttached) {
        document.getElementById('ai-chat-settings-exp-web-edit')._listenerAttached = true;
        document.getElementById('ai-chat-settings-exp-web-edit').addEventListener('change', function() {
          if (this.checked) {
            if (!confirm('此功能为实验功能，还不完善，请谨慎开启。')) {
              this.checked = false;
              return;
            }
          }
          try {
            localStorage.setItem('hupilot_exp_web_edit', this.checked ? '1' : '0');
            expWebEditEnabled = this.checked;
          } catch(e) {}
          var editBtn = document.getElementById('ai-chat-html-edit-btn');
          if (editBtn) editBtn.style.display = (isHtmlFile || expWebEditEnabled) ? '' : 'none';
        });
      }
      // Browser control
      var browserCb = document.getElementById('ai-chat-settings-exp-browser');
      if (browserCb) {
        browserCb.checked = s.browserControl === true;
        if (!browserCb._listenerAttached) {
          browserCb._listenerAttached = true;
          browserCb.addEventListener('change', function() {
            if (this.checked) {
              if (!confirm('浏览器操控模式为实验功能，开启后可通过虎宝控制当前浏览器页面，浏览器上方会显示"虎宝"已开始调试此浏览器的提示。请确认后再开启此功能。')) {
                this.checked = false;
                return;
              }
            }
          });
        }
      }
      // Browser control vision sub-setting
      var visionCb = document.getElementById('ai-chat-settings-exp-browser-vision');
      if (visionCb) {
        visionCb.checked = s.browserUseVision === true;
        visionCb.style.display = s.browserControl === true ? '' : 'none';
        if (!visionCb._listenerAttached) {
          visionCb._listenerAttached = true;
          visionCb.addEventListener('change', function() {
            if (this.checked) {
              if (!confirm('目前视觉识别功能为实验功能，可能会有不完善的地方，敬请谅解。另请务必使用可识别图片的模型，否则请勿开启此功能。')) {
                this.checked = false;
                return;
              }
            }
          });
          browserCb.addEventListener('change', function() {
            visionCb.style.display = this.checked ? '' : 'none';
          });
        }
      }
      // Edge TTS Direct
      var ttsEdgeCb = document.getElementById('ai-chat-settings-tts-edge-direct');
      ttsEdgeCb.checked = s.ttsEdgeDirect === true;
      if (!ttsEdgeCb._listenerAttached) {
        ttsEdgeCb._listenerAttached = true;
        ttsEdgeCb.addEventListener('change', function() {
        });
      }
      // TTS
      document.getElementById('ai-chat-settings-tts-enabled').checked = s.ttsEnabled || false;
      var ttsShow = s.ttsEnabled || false;
      document.getElementById('ai-chat-settings-tts-voice-row').style.display = ttsShow ? '' : 'none';
      document.getElementById('ai-chat-settings-tts-rate-row').style.display = ttsShow ? '' : 'none';
      document.getElementById('ai-chat-settings-tts-hint').style.display = ttsShow ? '' : 'none';
      // Voice
      var foundVoice = false;
      for (var vi = 0; vi < AI_TTS_VOICES.length; vi++) {
        if (AI_TTS_VOICES[vi].id === s.ttsVoice) {
          document.getElementById('ai-chat-settings-tts-voice').value = s.ttsVoice;
          foundVoice = true; break;
        }
      }
      if (!foundVoice && s.ttsVoice) {
        document.getElementById('ai-chat-settings-tts-voice').value = AI_TTS_VOICE_CUSTOM;
        document.getElementById('ai-chat-settings-tts-voice').style.display = 'none';
        document.getElementById('ai-chat-settings-tts-voice-custom').style.display = '';
        document.getElementById('ai-chat-settings-tts-voice-custom').value = s.ttsVoice;
        document.getElementById('ai-chat-settings-tts-voice-back').style.display = '';
        document.getElementById('ai-chat-settings-tts-engine-links').style.display = '';
      }
      document.getElementById('ai-chat-settings-tts-rate').value = s.ttsRate || 1.10;
      document.getElementById('ai-chat-settings-tts-rate-val').value = (s.ttsRate || 1.10).toFixed(2);
      // Search
      document.getElementById('ai-chat-settings-search-provider').value = s.webSearchProvider || 'tavily';
      document.getElementById('ai-chat-search-provider').value = s.webSearchProvider || 'tavily';
      document.getElementById('ai-chat-settings-tavily-key').value = s.tavilyApiKey || '';
      document.getElementById('ai-chat-settings-baidu-key').value = s.baiduApiKey || '';
      var asKeyEl = document.getElementById('ai-chat-settings-anysearch-key');
      if (asKeyEl) asKeyEl.value = s.anysearchApiKey || '';
      document.getElementById('ai-chat-settings-search-results').value = s.webSearchMaxResults || 5;
      renderCustomQuickActionsUI();
      // Mobile mode
      var mmCb = document.getElementById('ai-chat-settings-mobile-mode');
      if (mmCb) {
        mmCb.checked = s.mobileMode === true;
        mmCb.addEventListener('change', function() {
          applyMobileMode(this.checked);
        });
      }
      // Language
      var foundLang = false;
      for (var j = 0; j < AI_LANGUAGES.length; j++) {
        if (AI_LANGUAGES[j] === s.translateLanguage) {
          document.getElementById('ai-chat-settings-lang').value = s.translateLanguage;
          foundLang = true; break;
        }
      }
      if (!foundLang && s.translateLanguage) {
        var langSel = document.getElementById('ai-chat-settings-lang');
        langSel.value = AI_LANG_CUSTOM;
        langSel.style.display = 'none';
        document.getElementById('ai-chat-settings-lang-custom').style.display = '';
        document.getElementById('ai-chat-settings-lang-custom').value = s.translateLanguage;
        document.getElementById('ai-chat-settings-lang-back').style.display = '';
      }
      // Shell 设置
      var shellCb = document.getElementById('ai-chat-settings-exp-shell');
      if (shellCb) {
        shellCb.checked = s.shellHostEnabled === true;
        shellMasterEnabled = shellCb.checked;
        updateShellToggle();
        var showShell = shellCb.checked;
        document.getElementById('ai-chat-shell-status-row').style.display = showShell ? '' : 'none';
        document.getElementById('ai-chat-shell-install-row').style.display = showShell ? '' : 'none';
        document.getElementById('ai-chat-shell-test-row').style.display = showShell ? '' : 'none';
        var updateShellStatus = function() {
          var isEdge = navigator.userAgent.indexOf('Edg/') > -1;
          var browser = isEdge ? 'edge' : 'chrome';
          var extId = chrome.runtime.id || 'kgpeoblpookpclfcoicagocelngcaohe';
          var cmdEl = document.getElementById('ai-chat-shell-install-cmd');
          if (cmdEl) cmdEl.textContent = 'npx hupilot-shell-host install --browser ' + browser + ' --extension-id ' + extId;
          var statusEl = document.getElementById('ai-chat-shell-status');
          var infoEl = document.getElementById('ai-chat-shell-status-info');
          if (statusEl) statusEl.innerHTML = '状态: 检测中...';
          if (infoEl) infoEl.innerHTML = '';
          callShellHost('tools/call', { name: 'shell_status', arguments: {} }).then(function() {
            if (statusEl) statusEl.innerHTML = '状态: <span style="color:#607cd2">已连接</span>';
            loadSkillList();
            checkShellHostVersion().then(function(v) {
              if (infoEl) {
                if (v === SHELL_HOST_LATEST_VERSION) {
                  infoEl.innerHTML = '<span style="color:#607cd2">已是最新版（v' + v + '）</span>';
                } else {
                  infoEl.innerHTML = '<span style="color:#e53935">v' + v + '（需要升级到最新版: ' + SHELL_HOST_LATEST_VERSION + '）</span>';
                }
              }
            }).catch(function() {});
          }).catch(function() {
            if (statusEl) statusEl.innerHTML = '状态: <span style="color:#e53935">未安装</span>';
            if (infoEl) infoEl.innerHTML = '';
          });
        };
        if (showShell) updateShellStatus();
        shellCb.addEventListener('change', function() {
          var checked = this.checked;
          if (checked && !confirm('开启后可通过虎宝执行本地命令及读写本地文件，此功能为实验功能，功能尚不完善，且需要安装本地程序，请谨慎使用。\n\n确认开启吗？')) {
            this.checked = false;
            return;
            }
          shellMasterEnabled = this.checked;
          document.getElementById('ai-chat-shell-status-row').style.display = checked ? '' : 'none';
          document.getElementById('ai-chat-shell-install-row').style.display = checked ? '' : 'none';
          document.getElementById('ai-chat-shell-test-row').style.display = checked ? '' : 'none';
          updateShellToggle();
          if (checked) updateShellStatus();
        });
        var testBtn = document.getElementById('ai-chat-shell-test-btn');
        if (testBtn) {
          testBtn.addEventListener('click', function() {
            updateShellStatus();
          });
        }
        var upgradeBtn = document.getElementById('ai-chat-shell-upgrade-btn');
        if (upgradeBtn) {
          upgradeBtn.addEventListener('click', function() {
            var infoEl = document.getElementById('ai-chat-shell-status-info');
            if (infoEl) infoEl.innerHTML = '正在升级...';
            callShellHost('tools/call', {
              name: 'shell_exec',
              arguments: { command: 'npx --registry https://registry.npmjs.org/ hupilot-shell-host install', timeout_ms: 120000 }
            }).then(function() {
              if (infoEl) infoEl.innerHTML = '<span style="color:#607cd2">升级成功，请重启浏览器生效</span>';
            }).catch(function(err) {
              if (infoEl) infoEl.innerHTML = '<span style="color:#e53935">升级失败: ' + err.message + '</span>';
            });
          });
        }
      }
    });
  }

  function saveSettingsFromForm() {
    var s = {};
    s.provider = document.getElementById('ai-chat-settings-provider').value;
    s.baseUrl = document.getElementById('ai-chat-settings-baseurl').value.trim();
    var modelEl = document.getElementById('ai-chat-settings-model');
    s.model = modelEl.style.display !== 'none' ? modelEl.value : document.getElementById('ai-chat-settings-model-custom').value.trim();
    s.providerKeys = {};
    var keysContainer = document.getElementById('ai-chat-settings-apikey-rows');
    var inputs = keysContainer.querySelectorAll('.ai-chat-settings-apikey-input');
    for (var ki = 0; ki < inputs.length; ki++) {
      var inp = inputs[ki];
      s.providerKeys[inp.dataset.provider] = inp.value.trim();
    }
    s.apiKey = s.providerKeys[s.provider] || '';
    s.systemPrompt = document.getElementById('ai-chat-settings-prompt').value.trim();
    s.maxHistoryRounds = parseInt(document.getElementById('ai-chat-settings-history').value, 10) || 0;
    s.maxSessions = parseInt(document.getElementById('ai-chat-settings-max-sessions').value, 10) || 50;
    s.thinkingMode = document.getElementById('ai-chat-settings-thinking').checked;
    s.reasoningEffort = document.getElementById('ai-chat-settings-reasoning').value;
    s.darkMode = document.getElementById('ai-chat-settings-darkmode').value;
    s.selectionPopup = document.getElementById('ai-chat-settings-selection-popup').checked;
    s.deskPetAlways = document.getElementById('ai-chat-settings-deskpet').checked;
    s.deskPetTexts = document.getElementById('ai-chat-settings-deskpet-texts').value;
    try {
      var lines = s.deskPetTexts.split('\n').filter(Boolean);
      if (lines.length > 0) localStorage.setItem('hupilot_tc', JSON.stringify(lines));
    } catch(e) {}
    s.deskPetInterval = parseInt(document.getElementById('ai-chat-settings-deskpet-interval').value, 10) || 2;
    s.deskPetDuration = parseInt(document.getElementById('ai-chat-settings-deskpet-duration').value, 10) || 5;
    try {
      localStorage.setItem('hupilot_iv', s.deskPetInterval);
      localStorage.setItem('hupilot_dr', s.deskPetDuration);
    } catch(e) {}
    var selectedSize = document.querySelector('input[name="petSize"]:checked');
    if (selectedSize) { s.petSize = selectedSize.value; applyPetBtnSize(selectedSize.value); }
    s.sleepTimeout = parseInt(document.getElementById('ai-chat-settings-sleep-timeout').value, 10);
    if (isNaN(s.sleepTimeout) || s.sleepTimeout < 0) s.sleepTimeout = 3;
    s.sleepTexts = document.getElementById('ai-chat-settings-sleep-texts').value;
    try {
      var sleepLines = s.sleepTexts.split('\n').filter(Boolean);
      if (sleepLines.length > 0) localStorage.setItem('hupilot_stc', JSON.stringify(sleepLines));
      else localStorage.removeItem('hupilot_stc');
      localStorage.setItem('hupilot_st', s.sleepTimeout);
    } catch(e) {}
    if (sleepState) {
      sleepState.timeout = s.sleepTimeout;
      if (sleepState.isSleeping) wakeUp();
      if (sleepState.timer) clearTimeout(sleepState.timer);
      if (s.sleepTimeout > 0) {
        sleepState.timer = setTimeout(goToSleep, s.sleepTimeout * 60000);
      }
    }
    // Reminders save + validation
    s.reminderEnabled = document.getElementById('ai-chat-settings-reminder-enabled').checked;
    var reminders = collectRemindersFromForm();
    if (s.reminderEnabled && reminders.length > 0) {
      var times = {};
      for (var ri = 0; ri < reminders.length; ri++) {
        if (!reminders[ri].enabled) continue;
        var t = reminders[ri].time;
        if (times[t]) {
          showToast('存在相同时间的提醒（' + t + '），请修改');
          return;
        }
        times[t] = true;
      }
    }
    s.reminders = reminders;
    s.experimentalWebEdit = document.getElementById('ai-chat-settings-exp-web-edit').checked;
    try {
      localStorage.setItem('hupilot_exp_web_edit', s.experimentalWebEdit ? '1' : '0');
      expWebEditEnabled = s.experimentalWebEdit;
    } catch(e) {}
    s.browserControl = document.getElementById('ai-chat-settings-exp-browser').checked;
    browserControlEnabled = s.browserControl;
    var browserBtn = document.getElementById('ai-chat-browser-btn');
    if (browserBtn) browserBtn.style.display = browserControlEnabled ? '' : 'none';
    s.browserUseVision = document.getElementById('ai-chat-settings-exp-browser-vision').checked;
    var visionCb = document.getElementById('ai-chat-settings-exp-browser-vision');
    if (visionCb) visionCb.style.display = browserControlEnabled ? '' : 'none';
    s.shellHostEnabled = document.getElementById('ai-chat-settings-exp-shell').checked;
    s.ttsEdgeDirect = document.getElementById('ai-chat-settings-tts-edge-direct').checked;
    s.mobileMode = document.getElementById('ai-chat-settings-mobile-mode').checked;
    s.pageTranslation = document.getElementById('ai-chat-settings-exp-page-translate').checked;
    expPageTranslationEnabled = s.pageTranslation;
    var transBtn = document.getElementById('ai-chat-translate-btn');
    if (transBtn) transBtn.style.display = expPageTranslationEnabled ? '' : 'none';
    if (!expPageTranslationEnabled && ptState !== 'idle') restorePageText();
    s.pageTranslateBilingual = document.getElementById('ai-chat-settings-page-bilingual').checked;
    s.pageTranslateBilingualStyle = document.getElementById('ai-chat-settings-bilingual-style').value;
    s.pageContentMaxChars = parseInt(document.getElementById('ai-chat-settings-content-limit').value, 10) || 100000;
    s.outlookSystemPrompt = document.getElementById('ai-chat-settings-outlook-prompt').value.trim();
    s.outlookUserInfo = document.getElementById('ai-chat-settings-outlook-userinfo').value.trim();
    s.outlookReplyPrompt = document.getElementById('ai-chat-settings-outlook-reply-prompt').value.trim();
    s.outlookReplyBtn = document.getElementById('ai-chat-settings-outlook-reply-btn').checked;
    s.outlookReplyPlusBtn = document.getElementById('ai-chat-settings-outlook-reply-plus-btn').checked;
    s.outlookReplyCcEnabled = document.getElementById('ai-chat-settings-outlook-reply-cc').checked;
    s.outlookReplyBccEnabled = document.getElementById('ai-chat-settings-outlook-reply-bcc').checked;
    s.webQaSystemPrompt = document.getElementById('ai-chat-settings-webqa-prompt').value.trim();
    ['default_summary','default_translate','outlook_summary','outlook_reply','outlook_keypoints','outlook_translate'].forEach(function(id) {
      s['actionEnabled_' + id] = document.getElementById('ai-chat-settings-action-' + id).checked;
    });
    var langEl = document.getElementById('ai-chat-settings-lang');
    s.translateLanguage = langEl.style.display !== 'none' ? langEl.value : document.getElementById('ai-chat-settings-lang-custom').value.trim();

    // TTS
    s.ttsEnabled = document.getElementById('ai-chat-settings-tts-enabled').checked;
    var ttsVoiceEl = document.getElementById('ai-chat-settings-tts-voice');
    s.ttsVoice = ttsVoiceEl.style.display !== 'none' ? ttsVoiceEl.value : document.getElementById('ai-chat-settings-tts-voice-custom').value.trim();
    s.ttsRate = parseFloat(document.getElementById('ai-chat-settings-tts-rate').value) || 1.10;
    // Search
    s.webSearchProvider = document.getElementById('ai-chat-settings-search-provider').value;
    s.tavilyApiKey = document.getElementById('ai-chat-settings-tavily-key').value.trim();
    s.baiduApiKey = document.getElementById('ai-chat-settings-baidu-key').value.trim();
    var asKeyEl = document.getElementById('ai-chat-settings-anysearch-key');
    s.anysearchApiKey = asKeyEl ? asKeyEl.value.trim() : '';
    s.webSearchMaxResults = parseInt(document.getElementById('ai-chat-settings-search-results').value, 10) || 0;

    // 收集自定义快捷指令
    s.customQuickActions = collectCustomQuickActions();

    for (var key in AI_DEFAULT_SETTINGS) {
      if (s[key] === undefined) s[key] = AI_DEFAULT_SETTINGS[key];
    }

    var statusEl = document.getElementById('ai-chat-settings-status');
    saveAISettings(s).then(function() {
      if (applyDarkMode) applyDarkMode();
      updateAllTtsButtons();
      showToast('设置已保存');
    }).catch(function(err) {
      showToast('保存失败：' + err.message);
    });
  }

  // === 自定义快捷指令管理 ===
  function renderCustomQuickActionsUI() {
    var listEl = document.getElementById('ai-chat-settings-quick-actions-list');
    readAISettings().then(function(settings) {
      var actions = settings.customQuickActions || [];
      listEl.innerHTML = '';
      actions.forEach(function(action, idx) {
        var row = document.createElement('div');
        row.className = 'ai-chat-settings-qa-row';
        row.innerHTML =
          '<input class="ai-chat-settings-qa-label" value="' + escapeHtml(action.label) + '" placeholder="按钮文字">' +
          '<input class="ai-chat-settings-qa-prompt" value="' + escapeHtml(action.prompt) + '" placeholder="提示词">' +
           '<button class="ai-chat-settings-qa-delete" data-idx="' + idx + '"><svg viewBox="0 0 14 14" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></svg></button>';
        listEl.appendChild(row);
      });
      listEl.querySelectorAll('.ai-chat-settings-qa-delete').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var actions = settings.customQuickActions || [];
          actions.splice(parseInt(this.dataset.idx), 1);
          saveAISettings({ customQuickActions: actions }).then(renderCustomQuickActionsUI);
        });
      });
    });
  }

  function collectCustomQuickActions() {
    var rows = document.querySelectorAll('#ai-chat-settings-quick-actions-list .ai-chat-settings-qa-row');
    var actions = [];
    var idx = 0;
    rows.forEach(function(row) {
      var label = row.querySelector('.ai-chat-settings-qa-label').value.trim();
      var prompt = row.querySelector('.ai-chat-settings-qa-prompt').value.trim();
      if (label && prompt) {
        actions.push({ id: 'custom_' + idx++, label: label, prompt: prompt });
      }
    });
    return actions;
  }

  // === 定时提醒 ===

  var WEEK_NAMES = ['周日','周一','周二','周三','周四','周五','周六'];

  function createReminderRow(data) {
    var row = document.createElement('div');
    row.className = 'ai-chat-settings-reminder-row';
    var text = (data.text || '').substring(0, 15);
    var time = data.time || (('0' + new Date().getHours()).slice(-2) + ':' + ('0' + new Date().getMinutes()).slice(-2));
    var type = data.type || 'once';
    var date = data.date || new Date().toISOString().slice(0, 10);
    var days = data.days || [];

    var enabled = data.enabled !== false;
    var enabledChecked = enabled ? 'checked' : '';

    var html = '<label class="reminder-enabled-label"><input type="checkbox" class="reminder-enabled" ' + enabledChecked + '></label>' +
      '<input type="text" class="reminder-text" value="' + text.replace(/"/g, '&quot;') + '" maxlength="15" placeholder="提醒内容">' +
      '<input type="time" class="reminder-time" value="' + time + '">' +
      '<select class="reminder-type">' +
        '<option value="once"' + (type === 'once' ? ' selected' : '') + '>单次</option>' +
        '<option value="weekly"' + (type === 'weekly' ? ' selected' : '') + '>每周</option>' +
      '</select>' +
      '<div class="reminder-date-wrap" style="display:' + (type === 'once' ? '' : 'none') + '">' +
        '<input type="date" class="reminder-date" value="' + date + '">' +
      '</div>' +
      '<div class="reminder-days-wrap" style="display:' + (type === 'weekly' ? '' : 'none') + '">';
    for (var di = 0; di < 7; di++) {
      var selected = days.indexOf(di) !== -1;
      html += '<span class="reminder-day' + (selected ? ' selected' : '') + '" data-day="' + di + '">' + WEEK_NAMES[di] + '</span>';
    }
    html += '</div>' +
      '<button class="reminder-delete" title="删除"><svg viewBox="0 0 14 14" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></svg></button>';

    row.innerHTML = html;

    // Type toggle: show/hide date/days
    row.querySelector('.reminder-type').addEventListener('change', function() {
      var isWeekly = this.value === 'weekly';
      row.querySelector('.reminder-date-wrap').style.display = isWeekly ? 'none' : '';
      row.querySelector('.reminder-days-wrap').style.display = isWeekly ? '' : 'none';
    });

    // Day toggle
    row.querySelectorAll('.reminder-day').forEach(function(span) {
      span.addEventListener('click', function() {
        this.classList.toggle('selected');
      });
    });

    // Delete
    row.querySelector('.reminder-delete').addEventListener('click', function() {
      row.remove();
    });

    // Text maxlength enforcement
    row.querySelector('.reminder-text').addEventListener('input', function() {
      if (this.value.length > 15) this.value = this.value.substring(0, 15);
    });

    return row;
  }

  function collectRemindersFromForm() {
    var rows = document.querySelectorAll('#ai-chat-settings-reminders-list .ai-chat-settings-reminder-row');
    var reminders = [];
    rows.forEach(function(row) {
      var text = row.querySelector('.reminder-text').value.trim();
      if (!text) return;
      var time = row.querySelector('.reminder-time').value;
      if (!time) return;
      var enabled = row.querySelector('.reminder-enabled').checked;
      var type = row.querySelector('.reminder-type').value;
      var date = '';
      var days = [];
      if (type === 'once') {
        date = row.querySelector('.reminder-date').value;
      } else {
        row.querySelectorAll('.reminder-day.selected').forEach(function(span) {
          days.push(parseInt(span.dataset.day));
        });
        if (days.length === 0) return;
      }
      reminders.push({
        id: 'rem_' + Math.random().toString(36).slice(2, 8),
        enabled: enabled,
        text: text,
        time: time,
        type: type,
        date: date,
        days: days
      });
    });
    return reminders;
  }

  var _reminderTimer = null;
  var _remindersToday = {};

  function initReminderTimer() {
    if (_reminderTimer) clearInterval(_reminderTimer);
    _remindersToday = {};
    // Pre-mark reminders whose time has already passed today
    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    readAISettings().then(function(s) {
      if (s.reminders) {
        s.reminders.forEach(function(r) {
          if (!r.enabled || !r.time) return;
          var parts = r.time.split(':');
          var remMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);
          if (remMin <= nowMin - 2) _remindersToday[r.id || ('rem_' + r.time)] = true;
        });
      }
    });
    _reminderTimer = setInterval(checkReminders, 10000);
  }

  function checkReminders() {
    readAISettings().then(function(s) {
      if (!s.reminderEnabled || !s.reminders || s.reminders.length === 0) return;
      var now = new Date();
      var today = now.toISOString().slice(0, 10);
      var hhmm = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
      var dayOfWeek = now.getDay(); // 0=Sun

      for (var i = 0; i < s.reminders.length; i++) {
        var r = s.reminders[i];
        if (!r.enabled || !r.text || !r.time) continue;
        if (r.time !== hhmm) continue;

        var key = r.id || 'rem_' + i;
        if (_remindersToday[key]) continue;

        var shouldTrigger = false;
        if (r.type === 'once') {
          if (r.date === today) shouldTrigger = true;
        } else {
          if (r.days.indexOf(dayOfWeek) !== -1) shouldTrigger = true;
        }

        if (shouldTrigger) {
          _remindersToday[key] = true;
          showReminderOnFloat(r.text);
          return; // only one reminder per check
        }
      }
    });
  }

  var _reminderShowing = false;

  function showReminderOnFloat(text) {
    if (floatingTimer) clearInterval(floatingTimer);
    if (floatingHideTimer) clearTimeout(floatingHideTimer);
    _reminderShowing = true;
    var wasHidden = floatingBtn.style.display === 'none' || floatingBtn.style.display === '';
    floatingBtn.style.display = 'flex';
    var label = document.getElementById('ai-chat-floating-label');
    if (!label) return;
    label.textContent = text.substring(0, 15);
    label.style.visibility = 'visible';
    floatingHideTimer = setTimeout(function() {
      label.style.visibility = 'hidden';
      _reminderShowing = false;
      if (wasHidden) floatingBtn.style.display = 'none';
      readAISettings().then(function(s) {
        if (s.deskPetAlways) startFloatingTimer();
      });
    }, 8000);
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // === Messages rendering ===
  function renderMessages() {
    var msgs = messagesEl.querySelectorAll('.ai-chat-msg');
    for (var i = 0; i < msgs.length; i++) msgs[i].remove();
    var session = getCurrentSession();
    if (!session || !session.messages || session.messages.length === 0) {
      welcomeEl.style.display = ''; return;
    }
    welcomeEl.style.display = 'none';
    for (var j = 0; j < session.messages.length; j++) {
      var msg = session.messages[j];
      if (msg.role === 'system' || msg.role === 'tool') continue;
      appendMessageDOM(msg.role, msg.content, msg.reasoning, msg.createdAt);
    }
    scrollToBottom();
  }

  function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          showToast('复制成功');
        }).catch(function() {
          fallbackCopy(text);
        });
      } else {
        fallbackCopy(text);
      }
    } catch (e) {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      showToast('复制成功');
    } catch (e) {
    }
    document.body.removeChild(ta);
  }

  // === TTS (via MAIN world injection for Edge neural voices) ===
  var ttsActiveBtn = null;
  var ttsSpeaking = false;
  var ttsDirectAudio = null; // direct Edge TTS audio element
  var ttsInjected = false;
  var _ttsEndListener = null;
  var ttsWsPort = null;
  var ttsWsMs = null;

  function injectTTSScript() {
    if (ttsInjected) return;
    ttsInjected = true;
    // chrome-extension:// 页面无法注入 MAIN-world 脚本，跳过
    if (location.protocol === 'chrome-extension:') return;
    chrome.runtime.sendMessage({ type: 'injectTTS' }, function(res) {
      if (res && res.error) console.warn('[TTS] Inject failed:', res.error);
    });
  }

  async function speakText(text, btnEl) {
    if (!text) return;
    if (btnEl.dataset.speaking === 'true') {
      await stopSpeech();
      return;
    }
    await stopSpeech();
    var settings = await readAISettings();
    if (!settings.ttsEnabled) return;
    var rate = settings.ttsRate || 1.10;
    var voiceId = settings.ttsVoice || 'zh-CN-XiaoyouNeural';
    btnEl.dataset.speaking = 'true';
    btnEl.innerHTML = '<svg viewBox="0 0 16 16" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><rect x="3" y="3" width="10" height="10" rx="2"/></svg>';
    btnEl.classList.add('playing');
    ttsActiveBtn = btnEl;
    ttsSpeaking = true;

    // 直接调用 Edge TTS — 优先 WebSocket 流式，失败则降级 HTTP blob
    if (settings.ttsEdgeDirect === true) {
      speakTextWs(text, voiceId, rate, btnEl);
      return;
    }

    window.postMessage({ type: '__TTS_SPEAK', text: text, rate: rate, voiceId: voiceId }, '*');
  }

  function stopSpeech() {
    return new Promise(function(resolve) {
      if (ttsWsPort) { try { ttsWsPort.postMessage({ type: 'cancel' }); ttsWsPort.disconnect(); } catch(e) {} ttsWsPort = null; }
      if (ttsWsMs) { try { ttsWsMs.endOfStream(); } catch(e) {} ttsWsMs = null; }
      if (ttsDirectAudio) { ttsDirectAudio.pause(); ttsDirectAudio.src = ''; ttsDirectAudio = null; }
      window.postMessage({ type: '__TTS_STOP' }, '*');
      ttsSpeaking = false;
      resetAllTtsBtns();
      _ttsEndListener = function() {
        _ttsEndListener = null;
        clearTimeout(tid);
        resolve();
      };
      var tid = setTimeout(function() {
        if (typeof _ttsEndListener === 'function') {
          _ttsEndListener = null;
          resolve();
        }
      }, 200);
    });
  }

  // === WebSocket 流式 TTS（Edge TTS 直调） ===
  function speakTextWs(text, voiceId, rate, btnEl) {
    var port = chrome.runtime.connect({ name: 'ttsEdgeDirectStream' });
    ttsWsPort = port;
    var ms, audioEl;
    try { ms = new MediaSource(); ttsWsMs = ms; } catch(e) { ms = null; }
    var sb = null;
    var pending = [];
    var queue = [];
    var appending = false;
    var ended = false;
    var played = false;
    var cleanupOnce = function() {
      if (port !== ttsWsPort) return;
      if (port) { try { port.postMessage({ type: 'cancel' }); port.disconnect(); } catch(e) {} ttsWsPort = null; }
      if (ms) { try { ms.endOfStream(); } catch(e) {} ttsWsMs = null; }
      ttsDirectAudio = null;
      ttsSpeaking = false;
      resetAllTtsBtns();
    };

    function flushQ() {
      if (!sb || appending) return;
      if (queue.length > 0) {
        appending = true;
        try { sb.appendBuffer(queue.shift()); } catch(e) { appending = false; }
      } else if (ended && ms && ms.readyState === 'open') {
        try { ms.endOfStream(); } catch(e) {}
      }
    }

    function playFallback() {
      console.log('[TTS-WS] Falling back to HTTP blob approach...');
      cleanupOnce();
      chrome.runtime.sendMessage({
        type: 'ttsEdgeDirect', text: text, voice: voiceId, rate: rate,
        pitch: 1.0, style: 'general', role: '', styleDegree: 1.0
      }, function(res) {
        if (res && res.ok && res.audio) {
          var bin = atob(res.audio);
          var bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          var blob = new Blob([bytes], { type: 'audio/mpeg' });
          var url = URL.createObjectURL(blob);
          var a = new Audio(url);
          ttsDirectAudio = a;
          a.onended = function() { ttsDirectAudio = null; URL.revokeObjectURL(url); ttsSpeaking = false; resetAllTtsBtns(); };
          a.onerror = function() { ttsDirectAudio = null; URL.revokeObjectURL(url); ttsSpeaking = false; resetAllTtsBtns(); };
          a.play().catch(function() { ttsSpeaking = false; resetAllTtsBtns(); });
        } else {
          cleanupOnce();
          window.postMessage({ type: '__TTS_SPEAK', text: text, rate: rate, voiceId: voiceId }, '*');
        }
      });
    }

    if (!ms) { console.log('[TTS-WS] MediaSource not available, falling back'); playFallback(); return; }

    audioEl = new Audio();
    audioEl.src = URL.createObjectURL(ms);
    ttsDirectAudio = audioEl;
    audioEl.onended = cleanupOnce;
    audioEl.onerror = cleanupOnce;

    ms.addEventListener('sourceopen', function() {
      try { sb = ms.addSourceBuffer('audio/mpeg'); } catch(e) {
        console.warn('[TTS-WS] addSourceBuffer failed:', e.message);
        sb = null;
        playFallback();
        return;
      }
      for (var i = 0; i < pending.length; i++) queue.push(pending[i]);
      pending = null;
      sb.addEventListener('updateend', function() { appending = false; flushQ(); });
      flushQ();
    });

    port.onMessage.addListener(function(msg) {
      if (msg.type === 'audio') {
        var bin = atob(msg.data);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        if (pending) { pending.push(bytes.buffer); return; }
        queue.push(bytes.buffer);
        if (!played) {
          played = true;
          audioEl.play().catch(function() {});
        }
        flushQ();
      } else if (msg.type === 'end') {
        ended = true;
        flushQ();
      } else if (msg.type === 'error') {
        console.warn('[TTS-WS] Stream error:', msg.msg);
        playFallback();
      } else if (msg.type === 'debug') {
        console.log('[TTS-WS]', msg.msg);
      }
    });

    port.postMessage({
      type: 'speak', text: text, voice: voiceId, rate: rate,
      pitch: 1.0, style: 'general', role: '', styleDegree: 1.0
    });
  }

  function resetAllTtsBtns() {
    if (ttsActiveBtn) {
      ttsActiveBtn.dataset.speaking = 'false';
      ttsActiveBtn.innerHTML = '<svg viewBox="0 0 16 16" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><polygon points="4 2 14 8 4 14"/></svg>';
      ttsActiveBtn.classList.remove('playing');
      ttsActiveBtn = null;
    }
  }

  function updateAllTtsButtons() {
    readAISettings().then(function(s) {
      var show = s.ttsEnabled || false;
      var btns = document.querySelectorAll('.ai-chat-msg-tts');
      btns.forEach(function(btn) { btn.style.display = show ? '' : 'none'; });
    });
  }

  function addTtsButton(container, textSource) {
    var ttsBtn = document.createElement('button');
    ttsBtn.className = 'ai-chat-msg-tts';
    ttsBtn.innerHTML = '<svg viewBox="0 0 16 16" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><polygon points="4 2 14 8 4 14"/></svg>';
    ttsBtn.title = '朗读';
    ttsBtn.style.display = 'none';
    ttsBtn.addEventListener('click', function() {
      speakText(textSource(), ttsBtn);
    });
    readAISettings().then(function(s) {
      ttsBtn.style.display = s.ttsEnabled ? '' : 'none';
    });
    container.appendChild(ttsBtn);
    return ttsBtn;
  }

  function appendMessageDOM(role, content, reasoning, time) {
    var div = document.createElement('div');
    div.className = 'ai-chat-msg ' + role;
    var label = document.createElement('div');
    label.className = 'ai-chat-msg-label';
    label.textContent = role === 'user' ? '你' : 'AI';
    div.appendChild(label);
    var timeEl = document.createElement('span');
    timeEl.className = 'ai-chat-msg-time';
    timeEl.textContent = formatTime(time || Date.now());
    div.appendChild(timeEl);
    if (role === 'assistant' && reasoning) {
      var details = document.createElement('details');
      details.className = 'ai-chat-msg-reasoning';
      var summary = document.createElement('summary');
      summary.textContent = '思考过程';
      details.appendChild(summary);
      var rDiv = document.createElement('div');
      rDiv.className = 'ai-chat-msg-reasoning-content';
      rDiv.textContent = reasoning;
      details.appendChild(rDiv);
      div.appendChild(details);
    }
    var contentDiv = document.createElement('div');
    contentDiv.className = 'ai-chat-msg-content';
    if (role === 'assistant') {
      renderAssistantContent(contentDiv, content || '');
    } else {
      contentDiv.textContent = content || '';
    }
    div.appendChild(contentDiv);
    var actionsDiv = document.createElement('div');
    actionsDiv.className = 'ai-chat-msg-actions';
    var copyBtn = document.createElement('button');
    copyBtn.className = 'ai-chat-msg-copy';
    copyBtn.innerHTML = '<svg viewBox="0 0 16 16" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><rect x="5" y="2" width="9" height="10" rx="1.5"/><path d="M2 7v6a1 1 0 0 0 1 1h7"/></svg>';
    copyBtn.title = '复制';
    copyBtn.addEventListener('click', function() {
      var text = contentDiv.textContent || contentDiv.innerText || '';
      if (role === 'user') {
        navigator.clipboard.writeText(text);
        inputEl.value = text;
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
        inputEl.focus();
        showToast('复制成功');
      } else {
        copyToClipboard(text);
      }
    });
    actionsDiv.appendChild(copyBtn);
    addTtsButton(actionsDiv, function() { return contentDiv.textContent || contentDiv.innerText || ''; });
    if (role === 'assistant') {
      var doneBtn = document.createElement('button');
      doneBtn.className = 'ai-chat-msg-done';
      actionsDiv.appendChild(doneBtn);
    }
    if (role === 'assistant' && (location.hostname.includes('outlook.cloud.microsoft') || location.hostname.includes('outlook.live.com') || location.hostname.includes('outlook.com')) && typeof window.hupilotInsertIntoCompose === 'function' && document.querySelector('div[role="textbox"][aria-label="邮件正文"]')) {
      var insertBtn = document.createElement('button');
      insertBtn.className = 'ai-chat-msg-copy';
      insertBtn.innerHTML = '<svg viewBox="0 0 16 16" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M4 2h7l2 2v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M11 2v2h2"/></svg>';
      insertBtn.title = '插入到邮件（纯文本）';
      insertBtn.addEventListener('click', function() {
        var text = contentDiv.textContent || contentDiv.innerText || '';
        if (window.hupilotInsertIntoCompose(text)) {
          showToast('已插入到邮件');
        }
      });
      actionsDiv.appendChild(insertBtn);
      if (typeof window.hupilotInsertHtmlIntoCompose === 'function') {
        var htmlBtn = document.createElement('button');
        htmlBtn.className = 'ai-chat-msg-copy';
        htmlBtn.innerHTML = '<svg viewBox="0 0 16 16" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M4 2h7l2 2v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M11 2v2h2"/><path d="M5 7h5M5 9.5h3M5 12h4"/></svg>';
        htmlBtn.title = '插入到邮件（带格式）';
        htmlBtn.addEventListener('click', function() {
          var renderEl = contentDiv.querySelector('.ai-chat-msg-render');
          if (renderEl) {
            var clone = renderEl.cloneNode(true);
            clone.querySelectorAll('.ai-chat-code-copy, .ai-chat-code-copy-bg').forEach(function(el) { el.remove(); });
            var html = clone.innerHTML
              .replace(/<(p|div|li|blockquote)[^>]*>\s*<strong>(.*?)<\/strong>\s*<\/\1>/gi, '<$1>$2</$1>')
              .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '<div>$1</div>');
            if (window.hupilotInsertHtmlIntoCompose(html)) {
              showToast('已插入到邮件');
            }
          } else {
var text = (function() {
  var renderEl = contentDiv.querySelector('.ai-chat-msg-render');
  if (!renderEl) return contentDiv.innerText || contentDiv.textContent || '';
  var html = renderEl.innerHTML;
  html = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|blockquote|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
  return html.replace(/\n{3,}/g, '\n\n').trim();
})();
            if (window.hupilotInsertIntoCompose(text)) {
              showToast('已插入到邮件');
            }
          }
        });
        actionsDiv.appendChild(htmlBtn);
      }
    }
    div.appendChild(actionsDiv);
    if (role === 'assistant') showDoneCheck();
    messagesEl.appendChild(div);
  }

  function appendAssistantMessageDOM() {
    var now = Date.now();
    var div = document.createElement('div');
    div.className = 'ai-chat-msg assistant';
    var label = document.createElement('div');
    label.className = 'ai-chat-msg-label';
    label.textContent = 'AI';
    div.appendChild(label);
    var timeEl = document.createElement('span');
    timeEl.className = 'ai-chat-msg-time';
    timeEl.textContent = formatTime(now);
    div.appendChild(timeEl);
    var details = document.createElement('details');
    details.className = 'ai-chat-msg-reasoning';
    details.open = true;
    var summary = document.createElement('summary');
    summary.textContent = '思考过程';
    details.appendChild(summary);
    var rDiv = document.createElement('div');
    rDiv.className = 'ai-chat-msg-reasoning-content';
    details.appendChild(rDiv);
    div.appendChild(details);
    var cDiv = document.createElement('div');
    cDiv.className = 'ai-chat-msg-content';
    cDiv.textContent = '思考中...';
    div.appendChild(cDiv);
    var actionsDiv = document.createElement('div');
    actionsDiv.className = 'ai-chat-msg-actions';
    div.appendChild(actionsDiv);
    var copyBtn = document.createElement('button');
    copyBtn.className = 'ai-chat-msg-copy';
    copyBtn.innerHTML = '<svg viewBox="0 0 16 16" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><rect x="5" y="2" width="9" height="10" rx="1.5"/><path d="M2 7v6a1 1 0 0 0 1 1h7"/></svg>';
    copyBtn.title = '复制';
    copyBtn.addEventListener('click', function() {
      copyToClipboard(cDiv.textContent || '');
    });
    actionsDiv.appendChild(copyBtn);
    addTtsButton(actionsDiv, function() { return cDiv.textContent || ''; });
    var doneBtn = document.createElement('button');
    doneBtn.className = 'ai-chat-msg-done';
    actionsDiv.appendChild(doneBtn);
    messagesEl.appendChild(div);
    return { detailsEl: details, reasoningEl: rDiv, contentEl: cDiv, contentDiv: cDiv };
  }

  var pendingRenderText = null;
  var renderTimerId = null;

  function flushPendingRender() {
    if (renderTimerId) { clearTimeout(renderTimerId); renderTimerId = null; }
    var t = pendingRenderText;
    pendingRenderText = null;
    if (t == null) return;
    var msgs = messagesEl.querySelectorAll('.ai-chat-msg.assistant');
    if (msgs.length > 0) {
      var el = msgs[msgs.length - 1].querySelector('.ai-chat-msg-content');
      if (el) renderAssistantContent(el, t);
    }
    scrollToBottom();
  }

  function updateLastAssistantMessage(text) {
    pendingRenderText = text;
    if (/[。！？\n.!?]$/.test(text)) { flushPendingRender(); return; }
    if (renderTimerId) return;
    renderTimerId = setTimeout(function() {
      renderTimerId = null;
      flushPendingRender();
    }, 100);
  }

  function getLastDoneBtn() {
    var msgs = messagesEl.querySelectorAll('.ai-chat-msg.assistant');
    if (msgs.length === 0) return null;
    return msgs[msgs.length - 1].querySelector('.ai-chat-msg-done');
  }

  function showDoneLoading() {
    var btn = getLastDoneBtn();
    if (!btn) return;
    btn.innerHTML = '<svg viewBox="0 0 16 16" style="width:14px;height:14px;stroke:#607CD2;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M14 8a6 6 0 1 1-4.146-5.707" style="transform-origin:8px 8px;animation:ai-spin 0.8s linear infinite"/></svg>';
    btn.style.display = 'inline-flex';
  }

  function showDoneCheck() {
    var btn = getLastDoneBtn();
    if (!btn) return;
    btn.innerHTML = '<svg viewBox="0 0 16 16" style="width:14px;height:14px;stroke:#607CD2;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><circle cx="8" cy="8" r="6"/><path d="M5.5 7.5L8 10 11 6" style="stroke-dasharray:10;stroke-dashoffset:10;animation:ai-draw-check 0.5s ease-out forwards"/></svg>';
    btn.style.display = 'inline-flex';
    setTimeout(function() { btn.style.display = 'none'; }, 1300);
  }

  function hideDoneBtn() {
    var btn = getLastDoneBtn();
    if (btn) btn.style.display = 'none';
  }

  var scrollRafId = null;

  function scrollToBottom() {
    if (scrollRafId) cancelAnimationFrame(scrollRafId);
    scrollRafId = requestAnimationFrame(function() {
      scrollRafId = null;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var now = new Date();
    var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
    var hhmm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) {
      return hhmm;
    }
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + hhmm;
  }

  function showToast(msg) {
    var el = document.getElementById('ai-chat-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ai-chat-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'visible';
    clearTimeout(el._timer);
    el._timer = setTimeout(function() { el.className = ''; }, 3000);
  }

  function showBiliToast(msg) {
    var el = document.getElementById('ai-chat-bili-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ai-chat-bili-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'visible';
    clearTimeout(el._timer);
    el._timer = setTimeout(function() { el.className = ''; }, 2000);
  }

  // === Markdown renderer ===
  function renderMarkdown(text) {
    if (!text) return '';
    if (text.indexOf('&') >= 0) {
      text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/');
    }
    var parts = text.split(/(```[\s\S]*?```)/g);
    for (var i = 0; i < parts.length; i += 2) {
      parts[i] = parts[i].replace(/([^\n])\n(?!\n)(?![ \t]*[-*+>#\d])/g, '$1  \n');
    }
    text = parts.join('');
    // 将 LaTeX 数学格式 $...$ 转为纯文本
    text = text.replace(/\$([^\$]+)\$/g, function(m, inner) {
      return inner
        .replace(/\\sim/g, '~')
        .replace(/\\times/g, '×')
        .replace(/\\cdot/g, '·')
        .replace(/\\pm/g, '±')
        .replace(/\\leq/g, '≤')
        .replace(/\\geq/g, '≥')
        .replace(/\\approx/g, '≈')
        .replace(/\\circ/g, '°')
        .replace(/\\text\{([^}]*)\}/g, '$1')
        .replace(/\\([a-zA-Z]+)/g, '')
        .replace(/\{|\}/g, '')
        .replace(/\^/g, '')
        .trim();
    });
    // 将独立 ~（非 ~~ 中的）替换为全角波浪号，避免 marked 当作删除线
    text = text.replace(/(?<!~)~(?!~)/g, '～');
    try {
      return marked.parse(text, { gfm: true });
    } catch (e) {
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  }

  function addCodeCopyButtons(container) {
    var pres = container.querySelectorAll('pre');
    pres.forEach(function(pre) {
      if (pre.querySelector('.ai-chat-code-copy')) return;
      pre.style.position = 'relative';
      var btn = document.createElement('button');
      btn.className = 'ai-chat-code-copy';
      btn.innerHTML = '<svg viewBox="0 0 16 16" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><rect x="5" y="2" width="9" height="10" rx="1.5"/><path d="M2 7v6a1 1 0 0 0 1 1h7"/></svg>';
      btn.title = '复制代码块';
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var code = pre.querySelector('code');
        var text = code ? code.textContent : pre.textContent;
        navigator.clipboard.writeText(text).then(function() {
          showToast('复制成功');
        });
      });
      pre.appendChild(btn);
    });
  }

  function renderAssistantContent(el, text) {
    var renderEl = el.querySelector('.ai-chat-msg-render');
    if (!renderEl) {
      renderEl = document.createElement('div');
      renderEl.className = 'ai-chat-msg-render';
      el.insertBefore(renderEl, el.firstChild);
    }
    renderEl.innerHTML = renderMarkdown(text || '');
    addCodeCopyButtons(renderEl);
  }

  function exportConversation() {
    var session = getCurrentSession();
    if (!session || !session.messages || session.messages.length === 0) {
      showToast('没有可导出的消息');
      return;
    }
    var text = '# ' + (session.name || '对话') + '\n\n';
    for (var i = 0; i < session.messages.length; i++) {
      var msg = session.messages[i];
      if (msg.role === 'system') continue;
      text += '## ' + (msg.role === 'user' ? '你' : 'AI') + '\n\n';
      text += msg.content + '\n\n';
      if (msg.reasoning) {
        text += '> 思考过程：' + msg.reasoning + '\n\n';
      }
    }
    var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (session.name || '对话') + '.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  function savePageAsMarkdown() {
    if (typeof Defuddle === 'undefined') {
      chrome.runtime.sendMessage({ type: 'injectDefuddle' }, function(response) {
        if (response && response.success) {
          setTimeout(savePageAsMarkdown, 100);
        } else {
          showToast('加载内容提取器失败');
        }
      });
      return;
    }
    if (typeof window.fullPageToMarkdown === 'undefined') {
      chrome.runtime.sendMessage({ type: 'injectTurndown' }, function(response) {
        if (response && response.success) {
          setTimeout(savePageAsMarkdown, 100);
        } else {
          showToast('加载转换器失败');
        }
      });
      return;
    }
    extractFullPageAsMarkdown().then(function(md) {
      if (!md) { showToast('页面没有可提取的内容'); return; }
      var title = document.title || 'page';
      title = title.replace(/[/\\?%*:|"<>]/g, '');
      var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = title + '.md';
      a.click();
      URL.revokeObjectURL(url);
      showToast('已保存 ' + title + '.md');
    }).catch(function(err) {
      if (err.message === 'TURNDOWN_NOT_LOADED') {
        showToast('转换器未加载');
      } else {
        showToast('保存失败');
      }
    });
  }

  // === B 站字幕下载 ===
  function downloadBilibiliSubtitle() {
    if (typeof getBilibiliSubtitles !== 'function') {
      showToast('不在 B 站视频页面');
      return;
    }
    if (!window._biliSubRetryCount) window._biliSubRetryCount = 0;
    var retry = window._biliSubRetryCount;
    if (retry === 0) showToast('字幕下载中...');
    getBilibiliSubtitles().then(function(data) {
      if (!data || data.error === 'not_ready') {
        window._biliSubRetryCount++;
        if (window._biliSubRetryCount >= 30) {
          window._biliSubRetryCount = 0;
          showToast('字幕加载超时，请刷新页面');
          return;
        }
        setTimeout(downloadBilibiliSubtitle, 2000);
        return;
      }
      window._biliSubRetryCount = 0;
      if (!data || data.error || !data.subtitles || !data.subtitles.length) {
        showToast('未获取到字幕数据');
        return;
      }
      var sub = data.subtitles[0];
      if (sub.error) { showToast('字幕获取失败: ' + sub.error); return; }
      var title = data.title || 'bilibili_subtitle';
      title = title.replace(/[/\\?%*:|"<>]/g, '_');
      var srt = '';
      sub.segments.forEach(function(seg, i) {
        srt += (i + 1) + '\n';
        srt += formatSrtTime(seg.from) + ' --> ' + formatSrtTime(seg.to) + '\n';
        srt += seg.text + '\n\n';
      });
      var blob = new Blob(['\ufeff' + srt], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = title + '.' + sub.lan + '.srt';
      a.click();
      URL.revokeObjectURL(url);
      showToast('字幕已保存');
    }).catch(function() {
      setTimeout(downloadBilibiliSubtitle, 2000);
    });
  }

  function downloadYoutubeSubtitle() {
    if (typeof getYoutubeSubtitles !== 'function') {
      showToast('不在 YouTube 视频页面');
      return;
    }
    if (!window._ytSubRetryCount) window._ytSubRetryCount = 0;
    var retry = window._ytSubRetryCount;
    if (retry === 0) showToast('字幕下载中...');
    getYoutubeSubtitles().then(function(data) {
      if (!data || data.error === 'not_ready') {
        window._ytSubRetryCount++;
        if (window._ytSubRetryCount >= 30) {
          window._ytSubRetryCount = 0;
          showToast('字幕加载超时，请刷新页面');
          return;
        }
        setTimeout(downloadYoutubeSubtitle, 2000);
        return;
      }
      window._ytSubRetryCount = 0;
      if (!data || data.error || !data.subtitles || !data.subtitles.length) {
        showToast('未获取到字幕数据');
        return;
      }
      var sub = data.subtitles[0];
      if (sub.error) { showToast('字幕获取失败: ' + sub.error); return; }
      var title = data.title || document.title.replace(' - YouTube', '') || 'youtube_subtitle';
      title = title.replace(/[/\\?%*:|"<>]/g, '_');
      var srt = '';
      sub.segments.forEach(function(seg, i) {
        srt += (i + 1) + '\n';
        srt += formatSrtTime(seg.from) + ' --> ' + formatSrtTime(seg.to) + '\n';
        srt += seg.text + '\n\n';
      });
      var blob = new Blob(['\ufeff' + srt], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = title + '.' + sub.lan + '.srt';
      a.click();
      URL.revokeObjectURL(url);
      showToast('字幕已保存');
    }).catch(function() {
      setTimeout(downloadYoutubeSubtitle, 2000);
    });
  }

  function formatSrtTime(seconds) {
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    var pad = function(n, len) { var s = String(n); while (s.length < len) s = '0' + s; return s; };
    return pad(h, 2) + ':' + pad(m, 2) + ':' + pad(s.toFixed(3), 7).replace('.', ',');
  }

  // === Typing indicator ===
  function showTyping() {
    var div = document.createElement('div');
    div.className = 'ai-chat-msg assistant';
    div.id = 'ai-chat-typing-indicator';
    var label = document.createElement('div');
    label.className = 'ai-chat-msg-label';
    label.textContent = 'AI';
    div.appendChild(label);
    var contentDiv = document.createElement('div');
    contentDiv.className = 'ai-chat-msg-content';
    contentDiv.innerHTML = '正在思考 <span class="ai-chat-typing"><span></span><span></span><span></span></span>';
    div.appendChild(contentDiv);
    var actionsDiv = document.createElement('div');
    actionsDiv.className = 'ai-chat-msg-actions';
    var doneBtn = document.createElement('button');
    doneBtn.className = 'ai-chat-msg-done';
    actionsDiv.appendChild(doneBtn);
    div.appendChild(actionsDiv);
    messagesEl.appendChild(div);
    showDoneLoading();
    scrollToBottom();
  }

  function removeTyping() {
    var el = document.getElementById('ai-chat-typing-indicator');
    if (el) el.remove();
  }

  function stopAI() {
    if (currentAbortController) currentAbortController.abort();
  }

  // === Send message ===
  function sendMessage(displayText) {
    if (typeof displayText !== 'string') displayText = '';
    var text = displayText || inputEl.value.trim();
    if (!text || isStreaming) return;

    // === Bilibili 字幕调试命令 ===
    if (text === '#字幕' || text === '#subtitle') {
      inputEl.value = '';
      inputEl.style.height = 'auto';
      if (typeof getBilibiliSubtitles !== 'function') {
        appendMessageDOM('assistant', '[字幕] 不在 Bilibili 视频页面，或模块未加载。');
        scrollToBottom();
        return;
      }
      appendMessageDOM('user', '[调试] 获取字幕');
      appendMessageDOM('assistant', '[字幕] 正在获取...');
      scrollToBottom();
      getBilibiliSubtitles().then(function(result) {
        if (!result) {
          updateLastAssistantMessage('[字幕] 获取失败：返回空');
          return;
        }
        var diag = '';
        if (result.initialStateSubtitles) {
          diag += '\n__INITIAL_STATE__ 字幕列表：' + JSON.stringify(result.initialStateSubtitles).substring(0, 400);
        }
        if (result.rawSubs) {
          diag += '\nAPI 返回 subtitle 字段：' + JSON.stringify(result.rawSubs).substring(0, 400);
        }
        if (result.rawSample) {
          diag += '\nAPI 原始响应片段：' + result.rawSample;
        }
        if (result.error === 'no_cache' || result.error === 'no_subtitles') {
          updateLastAssistantMessage('[字幕] ' + (result.msg || result.error || '未获取到字幕。请刷新页面后重试#字幕。'));
          return;
        }
        if (result.error) {
          updateLastAssistantMessage('[字幕] 错误：' + result.error);
          return;
        }
        var msg = '[字幕] 获取成功！共有 ' + result.subtitles.length + ' 个字幕轨道：\n';
        for (var i = 0; i < result.subtitles.length; i++) {
          var s = result.subtitles[i];
          msg += '\n--- ' + s.lan_doc + ' (' + s.lan + ') ---\n';
          msg += '共 ' + s.total + ' 条字幕片段\n';
          if (s.segments && s.segments.length > 0) {
            var preview = s.segments.slice(0, 5);
            for (var j = 0; j < preview.length; j++) {
              var seg = preview[j];
              msg += '[' + seg.from.toFixed(1) + 's → ' + seg.to.toFixed(1) + 's] ' + seg.text + '\n';
            }
            if (s.segments.length > 5) {
              msg += '...（共 ' + s.segments.length + ' 条）\n';
            }
          }
          if (s.error) msg += '获取失败：' + s.error + '\n';
        }
        updateLastAssistantMessage(msg);
      }).catch(function(err) {
        updateLastAssistantMessage('[字幕] 发生异常：' + err.message);
      });
      return;
    }

    if (window.__heAIStylePrompt && text.startsWith('AI 改样式')) {
      var userExtra = text.substring('AI 改样式'.length).trim();
      inputEl.value = window.__heAIStylePrompt + (userExtra ? '\n用户要求：' + userExtra : '');
      window.__heAIStylePrompt = null;
      displayText = '<AI 改样式>';
      text = displayText;
    }
    var apiUserText = displayText ? inputEl.value.trim() : text;
    inputEl.value = '';
    inputEl.style.height = 'auto';
    welcomeEl.style.display = 'none';
    var session = getCurrentSession();
    if (!session) return;

    session.messages.push({ role: 'user', content: text, createdAt: Date.now() });
    appendMessageDOM('user', text);
    scrollToBottom();
    setSessionMessages(session.id, session.messages);

    isStreaming = true;
    sendBtn.classList.add('sending');
    sendBtn.title = '停止';
    sendBtn.innerHTML = '<svg viewBox="0 0 16 16" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><rect x="3" y="3" width="10" height="10" rx="2"/></svg>';
    showTyping();
    currentAbortController = new AbortController();

    // 每次发消息都从 DOM 实时提取，确保 AI 看到最新内容
    var contentPromise = webQaMode ? Promise.resolve('') : extractContent();
    contentPromise.then(function(freshContent) {
      if (freshContent) {
        pageContentCache = freshContent;
        updateSessionPageContent(session.id, freshContent);
      }

      return readAISettings().then(async function(settings) {
        if (!((settings.providerKeys || {})[settings.provider] || settings.apiKey)) throw new Error('请先在设置中配置 API Key');

        var apiMessages = [];
        var systemParts = [];
        if (webQaMode) {
          systemParts.push((settings.webQaSystemPrompt || '你的名字叫虎宝，你是一个专业的联网问答助手。你可以通过搜索工具联网获取最新信息来回答用户的问题。请充分利用搜索工具查询实时信息，并基于搜索结果给出全面、准确、结构化的回答。如果搜索结果不足以回答问题，请如实告知用户。不要编造信息，所有回答必须基于搜索结果。') + '当前日期是' + new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) + '。');
        } else if (optimizer && optimizer.getSystemPrompt) {
          var optPrompt = optimizer.name && optimizer.name.startsWith('Outlook') && settings.outlookSystemPrompt ? settings.outlookSystemPrompt : optimizer.getSystemPrompt();
          systemParts.push(optPrompt);
          if (optimizer.name && optimizer.name.startsWith('Outlook') && settings.outlookUserInfo && settings.outlookUserInfo.trim()) {
            systemParts.push('你的用户为【' + settings.outlookUserInfo.trim() + '】');
          }
        } else if (settings.systemPrompt) {
          systemParts.push(settings.systemPrompt);
        }
        if (systemParts.length === 0) {
          systemParts.push('你的名字叫虎宝，你是一只可爱的小老虎');
        }
        var _d = new Date();
        systemParts.push('当前日期是' + _d.getFullYear() + '年' + (_d.getMonth() + 1) + '月' + _d.getDate() + '日。');
        var pageContent = freshContent || pageContentCache || '';
        if (!webQaMode && pageContent && (session.messages.length === 1 || pendingPageInject)) {
          pendingPageInject = false;
          pageContent = pageContent.replace(/\0/g, '');
var maxChars = settings.pageContentMaxChars || 100000;
      if (pageContent.length > maxChars) pageContent = pageContent.substring(0, maxChars);
          systemParts.push('以下是当前页面的内容，请基于此回答用户问题：\n\n' + pageContent);
        }
        if (htmlEditMode && window.__htmlEditor && window.__htmlEditor.isEditMode()) {
          var selInfo = window.__htmlEditor.getSelectedInfo();
          if (selInfo) {
            systemParts.push('用户当前选中了元素 <' + selInfo.tag + '>，其信息：\n' + JSON.stringify(selInfo, null, 2));
          }
          systemParts.push('【HTML 编辑器指令】你处于 HTML 文件编辑模式。如果需要修改页面元素，请在你回复的最后附上以下格式的修改块：\n\n[APPLY]\n{"style": {"属性名": "属性值"}, "html": "新HTML内容（可选）", "text": "新文本内容（可选）", "attr": {"属性名": "属性值"}}\n[/APPLY]\n\n说明：\n- style: 要修改的 CSS 属性（如 backgroundColor、color、fontSize 等）\n- html: 替换元素的 innerHTML（与 text 互斥）\n- text: 替换元素的 textContent（与 html 互斥）\n- attr: 要修改的 HTML 属性（如 class、href、src 等）\n- 如果未选中元素则对整个页面生效\n- 务必在修改块前用中文给出解释和改动说明，不要只给 [APPLY] 块');
        }
        if (systemParts.length > 0) {
          var systemText = systemParts.join('\n\n');
          // 非 webQA 模式启用搜索时追加搜索指令
          if (!webQaMode && session.webSearchEnabled) {
            systemText = systemText.replace('不要长篇大论', '不要只做简短总结').replace('请简洁准确地回答', '请给出详细完整的回答，包含具体信息、数据、来源等细节');
            systemText += '\n\n请在搜索关键词中使用正确的日期。';
          }
          if (session.webSearchEnabled && searchProvider !== 'baidu-hp') {
            systemText += '\n\n当使用搜索工具时，请遵循以下规则：\n\n### 使用场景\n在以下情况应当使用 searchWeb 工具搜索互联网：\n- 用户询问实时信息、新闻、事件、汇率、天气等\n- 用户询问你不确定的知识，需要查阅最新资料\n- 用户明确要求你搜索或查询某些信息\n- 你需要验证事实、数据或引用来源\n\n当用户提供了具体的网页 URL 时，应当使用 fetchWebPage 工具获取页面内容。\n\n### 流程\n1. 先调用 searchWeb 进行搜索\n2. 搜索结果会回传给你\n3. 阅读搜索结果后，基于结果给出完整回答\n\n### 规则\n- 搜索关键词使用中文\n- 如第一次搜索不够，可搜索不同关键词\n- 回答必须基于搜索结果，包含具体信息、数据、来源\n- 不要只说"以上是搜索结果"或类似的简短总结';
          }
          if (session.shellHostEnabled) {
            systemText += '\n\n### Shell 工具\nShell 已连接。可通过工具调用（function calling）执行本地命令和 Python 代码。\n\n可用工具：\n- shell_exec: 执行本地 Shell/PowerShell 命令\n- python_exec: 执行 Python 代码（不要用 shell_exec 包一层，Python 代码必须直接使用 python_exec 工具）\n- shell_status: 查看系统环境\n- local_folder_pick: 选择本地文件夹\n\n路径中的反斜杠请用正斜杠替代，例如 C:/Users/\n\n规则：\n- Python 代码必须直接使用 python_exec 工具，不要用 shell_exec 执行 python 命令';
            if (window.__skillList && window.__skillList.length > 0) {
              systemText += '\n\n### 可用技能\n以下技能可帮助你完成特定任务。当用户问题与以下技能相关时，在回答中输出 <skill name="技能名"/> 来激活技能。激活后我会把完整技能文档注入对话。\n';
              for (var si = 0; si < window.__skillList.length; si++) {
                var sk = window.__skillList[si];
                systemText += '\n- **' + sk.name + '**: ' + (sk.description || '');
              }
              if (window.__skillsDir) {
                systemText += '\n\n技能脚本路径: ' + window.__skillsDir + '\n当运行技能中的 Python 脚本时，使用完整路径：\n' + window.__skillsDir + '/技能名/scripts/脚本名';
              }
            }
          }
          apiMessages.push({ role: 'system', content: systemText });
        }

        var historyMsgs = session.messages.slice(session.contextStartIndex || 0, -1);
        var maxRounds = webQaMode ? 10 : settings.maxHistoryRounds;
        if (maxRounds > 0) {
          var userIndices = [];
          for (var hi = 0; hi < historyMsgs.length; hi++) {
            if (historyMsgs[hi].role === 'user') userIndices.push(hi);
          }
          var keepRounds = 2;
          if (userIndices.length > maxRounds) {
            var keepStart = userIndices[userIndices.length - keepRounds];
            var summarizePart = historyMsgs.slice(0, keepStart);
            var keepPart = historyMsgs.slice(keepStart);
            try {
              var summaryMessages = [
                { role: 'system', content: '你是一个对话摘要助手。请用中文简要总结以下对话中已经完成的事情、做出的决定，以及待办事项。只输出总结内容，不要输出其他。' },
                { role: 'user', content: JSON.stringify(summarizePart.map(function(m) { return { role: m.role, content: typeof m.content === 'string' ? m.content.substring(0, 2000) : '' }; })) }
              ];
              var summaryText = await callAI(settings, summaryMessages, null, null, null);
              if (summaryText && typeof summaryText === 'string') {
                historyMsgs = [{ role: 'system', content: '前期对话摘要：\n' + summaryText }].concat(keepPart);
              } else {
                historyMsgs = keepPart;
              }
            } catch (e) {
              historyMsgs = keepPart;
            }
          }
        }
        for (var i = 0; i < historyMsgs.length; i++) {
          apiMessages.push({ role: historyMsgs[i].role, content: historyMsgs[i].content });
        }
        apiMessages.push({ role: 'user', content: apiUserText });

        var searchProvider = settings.webSearchProvider || 'tavily';
        var hasSearchKey = searchProvider === 'tavily' ? settings.tavilyApiKey : (searchProvider === 'baidu-standard' || searchProvider === 'baidu-hp') ? settings.baiduApiKey : searchProvider === 'anysearch' ? settings.anysearchApiKey : 'baidu-dom';
        var tools = null;
        if (webQaMode || session.webSearchEnabled) {
          if (searchProvider === 'baidu-dom') {
            tools = [WEB_SEARCH_TOOL, FETCH_WEB_PAGE_TOOL];
          } else if (!hasSearchKey) {
            tools = [FETCH_WEB_PAGE_TOOL];
          } else if (searchProvider === 'baidu-hp') {
            tools = [WEB_SEARCH_ONCE_TOOL];
          } else {
            tools = [WEB_SEARCH_TOOL, FETCH_WEB_PAGE_TOOL];
          }
        }
        if (session.shellHostEnabled) {
          if (!tools) tools = [];
          tools.push(SHELL_EXEC_TOOL, PYTHON_EXEC_TOOL, SHELL_STATUS_TOOL, LOCAL_FOLDER_PICK_TOOL);
        }
        var MAX_TOOL_ROUNDS = 10;

        function doSendLoop(messages, round, roundTools) {
          console.log('[AI Search] round ' + round + ', tools:', !!roundTools, 'messages:', messages.length);
          var fullContent = '';
          var fullReasoning = '';
          var msgEls = null;

          // 工具调用轮次不流式显示（等搜索结果）
          var isToolRound = !!roundTools;
          var searchProvider = settings.webSearchProvider || 'tavily';
          var isBaiduSearch = searchProvider === 'baidu-standard' || searchProvider === 'baidu-hp';

          return callAI(settings, messages, function(data) {
            if (data.reasoning) {
              if (!msgEls) { removeTyping(); msgEls = appendAssistantMessageDOM(); showDoneLoading(); }
              fullReasoning = data.reasoning;
              msgEls.reasoningEl.textContent = fullReasoning;
              scrollToBottom();
            }
            if (data.content) {
              if (!msgEls) {
                if (fullContent === '') {
                  var lastAssistant = messagesEl.querySelector('.ai-chat-msg.assistant:last-child');
                  var lastContent = lastAssistant && lastAssistant.querySelector('.ai-chat-msg-content');
                  if (lastContent && (lastContent.textContent.trim() === '正在联网搜索...' || lastContent.textContent.trim() === '正在获取网页内容...')) {
                    msgEls = { contentEl: lastContent };
                    lastContent.textContent = '';
                    showDoneLoading();
                  } else {
                    appendMessageDOM('assistant', '');
                    removeTyping();
                    var allAssistant = messagesEl.querySelectorAll('.ai-chat-msg.assistant');
                    if (allAssistant.length > 0) msgEls = { contentEl: allAssistant[allAssistant.length - 1].querySelector('.ai-chat-msg-content') };
                    showDoneLoading();
                  }
                }
                fullContent = data.content;
                if (msgEls && msgEls.contentEl) updateLastAssistantMessage(fullContent);
              } else {
                fullContent = data.content;
                updateLastAssistantMessage(fullContent);
              }
            }
          }, currentAbortController.signal, roundTools).then(function(result) {
            console.log('[AI Search] round ' + round + ' result keys:', result ? Object.keys(result).join(',') : 'null');
            if (result && result.tool_calls) console.log('[AI Search] tool_calls count:', result.tool_calls.length);
            if (result && result.tool_calls && result.content) console.log('[DEBUG] content + tool_calls both, contentFirst=' + JSON.stringify(result.content.substring(0, 80)));
            // Tool calls 处理
            if (result && result.tool_calls && result.tool_calls.length > 0 && round < MAX_TOOL_ROUNDS) {
              console.log('[AI Search] tool_calls detected:', JSON.stringify(result.tool_calls).substring(0, 200));
              removeTyping();

              // Shell 工具与搜索工具分离
              var SHELL_TOOL_NAMES = { shell_exec: 1, python_exec: 1, shell_status: 1, local_folder_pick: 1 };
              var shellTcs = result.tool_calls.filter(function(tc) { return SHELL_TOOL_NAMES[tc.function.name]; });
              var searchTcs = result.tool_calls.filter(function(tc) { return tc.function.name === 'searchWeb'; });
              var fetchTcs = result.tool_calls.filter(function(tc) { return tc.function.name === 'fetchWebPage'; });
              console.log('[AI Tools] shell:', shellTcs.length, 'searchWeb:', searchTcs.length, 'fetchWebPage:', fetchTcs.length);
              // 获取原始用户问题
              var origQuestion = '';
              for (var qi = messages.length - 2; qi >= 0; qi--) {
                if (messages[qi].role === 'user' && messages[qi].content) {
                  origQuestion = typeof messages[qi].content === 'string' ? messages[qi].content.substring(0, 1000) : '';
                  break;
                }
              }

              // 构建 assistant tool_calls 消息
              messages.push({
                role: 'assistant',
                content: null,
                tool_calls: result.tool_calls.map(function(tc) {
                  return { id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } };
                })
              });

              // === Baidu 搜索 ===
              if (isBaiduSearch && searchTcs.length > 0) {
                if (searchProvider === 'baidu-standard') {
                  // 标准版：获取搜索结果 → 加 tool 消息 → 递归让模型生成
                  if (round === 0) { appendMessageDOM('assistant', '正在联网搜索...'); scrollToBottom(); }
                  else { updateLastAssistantMessage('正在联网搜索...'); scrollToBottom(); }
                  var bdPromises = searchTcs.map(function(tc) {
                    var args = JSON.parse(tc.function.arguments);
                    var requestedMax = args.maxResults || 5;
                    return searchBaiduStream(searchProvider, settings.baiduApiKey, args.query, requestedMax, null, currentAbortController.signal);
                  });
                  return Promise.all(bdPromises).then(function(bdResults) {
                    removeTyping();
                    var allSearchText = '';
                    searchTcs.forEach(function(tc, i) {
                      var args = JSON.parse(tc.function.arguments);
                      allSearchText += '--- 搜索关键词：' + args.query + ' ---\n' + (bdResults[i] || '') + '\n\n';
                    });
                    if (fetchTcs.length > 0) {
                      var fPromises = fetchTcs.map(function(tc) {
                        var args = JSON.parse(tc.function.arguments);
                        return fetchWebPage(args.url);
                      });
                      return Promise.all(fPromises).then(function(fResults) {
                        fetchTcs.forEach(function(tc, i) {
                          allSearchText += '--- 网页内容 ---\n' + (fResults[i] || '') + '\n\n';
                        });
                        allSearchText = allSearchText.substring(0, 50000);
messages.push({ role: 'user', content: '【指令】以下规则优先级高于系统提示，必须遵守：\n1. 针对每一个问题分别给出详细完整的回答（至少3~5句），不要只写一行；\n2. 包含搜索结果中的具体信息、数据、来源等细节；\n3. 最后给出明确结论或建议。\n不要只做简短总结。\n\n用户的问题是：\n' + origQuestion + '\n\n搜索结果：\n\n' + allSearchText });
                        return doSendLoop(messages, round + 1, null);
                      });
                    }
                    allSearchText = allSearchText.substring(0, 50000);
                    messages.push({ role: 'user', content: '【指令】以下规则优先级高于系统提示，必须遵守：\n1. 针对每一个问题分别给出详细完整的回答（至少3~5句），不要只写一行；\n2. 包含搜索结果中的具体信息、数据、来源等细节；\n3. 最后给出明确结论或建议。\n不要只做简短总结。\n\n用户的问题是：\n' + origQuestion + '\n\n搜索结果：\n\n' + allSearchText });
                    return doSendLoop(messages, round + 1, null);
                  }).catch(function(err) {
                    console.log('[AI Baidu standard] error:', err.message);
                    removeTyping();
                  });
                } else {
                  // 高性能版：流式直出到 UI（合并多个 query 为一次调用）
                  appendMessageDOM('assistant', '');
                  scrollToBottom();
                  showDoneLoading();
                  var combinedQuery = searchTcs.map(function(tc) { return JSON.parse(tc.function.arguments).query; }).join(' ');
                  console.log('[Baidu HP] combinedQuery:', combinedQuery);
                  console.log('[Baidu HP] apiMessages context:', JSON.stringify(messages, null, 2));
                  var hpPromise = searchBaiduStream(searchProvider, settings.baiduApiKey, combinedQuery, 20, function(content) {
                    if (document.body.contains(sidebar)) { updateLastAssistantMessage(content); }
                  }, currentAbortController.signal);
                  return hpPromise.then(function(bdResult) {
                    removeTyping();
                    if (bdResult) {
                      updateLastAssistantMessage(bdResult);
                      session.messages.push({ role: 'assistant', content: bdResult, createdAt: Date.now() });
                      setSessionMessages(session.id, session.messages);
                    }
                    scrollToBottom();
                    if (fetchTcs.length > 0) {
                      var fetchPromises = fetchTcs.map(function(tc) {
                        var args = JSON.parse(tc.function.arguments);
                        return fetchWebPage(args.url);
                      });
                      return Promise.all(fetchPromises).then(function(fetchResults) {
                        var allText = fetchResults.join('\n\n').substring(0, 50000);
                  messages.push({ role: 'user', content: '以下是获取到的网页内容，请基于这些内容给出详细的、结构化的回答，不要只说简短总结：\n\n' + allText });
                        return doSendLoop(messages, round + 1, null);
                      });
                    }
                  }).catch(function(err) {
                    console.log('[AI Baidu hp] error:', err.message);
                    removeTyping();
                  });
                }
              }

              // === Tavily 搜索：获取结果后直接显示到 UI ===
              if (!isBaiduSearch && searchTcs.length > 0) {
                if (searchProvider === 'baidu-dom') {
                  // === 百度网页版搜索：获取搜索结果文本 → 加指令消息 → 递归让模型生成
                  if (round === 0) { appendMessageDOM('assistant', '正在联网搜索...'); scrollToBottom(); }
                  else { updateLastAssistantMessage('正在联网搜索...'); scrollToBottom(); }
                  var wfPromises = searchTcs.map(function(tc) {
                    var args = JSON.parse(tc.function.arguments);
                    var requestedMax = args.maxResults || 5;
                    return searchWeb('baidu-dom', '', args.query, requestedMax);
                  });
                  return Promise.all(wfPromises).then(function(wfResults) {
                    var allText = '';
                    searchTcs.forEach(function(tc, i) {
                      var args = JSON.parse(tc.function.arguments);
                      allText += '--- 搜索关键词：' + args.query + ' ---\n' + (wfResults[i] || '') + '\n\n';
                    });
                    if (fetchTcs.length > 0) {
                      var fPromises = fetchTcs.map(function(tc) {
                        var args = JSON.parse(tc.function.arguments);
                        return fetchWebPage(args.url);
                      });
                      return Promise.all(fPromises).then(function(fResults) {
                        fetchTcs.forEach(function(tc, i) {
                          allText += '--- 网页内容 ---\n' + (fResults[i] || '') + '\n\n';
                        });
                        allText = allText.substring(0, 50000);
                        messages.push({ role: 'user', content: '【指令】以下规则优先级高于系统提示，必须遵守：\n1. 针对每一个问题分别给出详细完整的回答（至少3~5句），不要只写一行；\n2. 包含搜索结果中的具体信息、数据、来源等细节；\n3. 最后给出明确结论或建议。\n不要只做简短总结。\n\n用户的问题是：\n' + origQuestion + '\n\n搜索结果：\n\n' + allText });
                        return doSendLoop(messages, round + 1, null);
                      });
                    }
                    allText = allText.substring(0, 50000);
                    messages.push({ role: 'user', content: '【指令】以下规则优先级高于系统提示，必须遵守：\n1. 针对每一个问题分别给出详细完整的回答（至少3~5句），不要只写一行；\n2. 包含搜索结果中的具体信息、数据、来源等细节；\n3. 最后给出明确结论或建议。\n不要只做简短总结。\n\n用户的问题是：\n' + origQuestion + '\n\n搜索结果：\n\n' + allText });
                    return doSendLoop(messages, round + 1, null);
                  });
                } else {
                  // Tavily / AnySearch: 搜索结果 → 加指令消息 → 递归让模型生成
                  if (round === 0) { appendMessageDOM('assistant', '正在联网搜索...'); scrollToBottom(); }
                  else { updateLastAssistantMessage('正在联网搜索...'); scrollToBottom(); }
                  var searchApiKey = searchProvider === 'anysearch' ? settings.anysearchApiKey : settings.tavilyApiKey;
                  var tPromises = searchTcs.map(function(tc) {
                    var args = JSON.parse(tc.function.arguments);
                    var cappedMax;
                    if (searchProvider === 'anysearch') {
                      cappedMax = args.maxResults || 10;
                    } else {
                      var requestedMax = args.maxResults || 5;
                      cappedMax = settings.webSearchMaxResults > 0 ? Math.min(requestedMax, settings.webSearchMaxResults) : requestedMax;
                    }
                    return searchWeb(searchProvider, searchApiKey, args.query, cappedMax);
                  });
                  return Promise.all(tPromises).then(function(tResults) {
                    removeTyping();
                    var allText = '';
                    searchTcs.forEach(function(tc, i) {
                      var args = JSON.parse(tc.function.arguments);
                      allText += '--- 搜索关键词：' + args.query + ' ---\n' + (tResults[i] || '') + '\n\n';
                    });
                    if (fetchTcs.length > 0) {
                      var fPromises = fetchTcs.map(function(tc) {
                        var args = JSON.parse(tc.function.arguments);
                        return fetchWebPage(args.url);
                      });
                      return Promise.all(fPromises).then(function(fResults) {
                        fetchTcs.forEach(function(tc, i) {
                          allText += '--- 网页内容 ---\n' + (fResults[i] || '') + '\n\n';
                        });
                        allText = allText.substring(0, 50000);
                        messages.push({ role: 'user', content: '【指令】以下规则优先级高于系统提示，必须遵守：\n1. 针对每一个问题分别给出详细完整的回答（至少3~5句），不要只写一行；\n2. 包含搜索结果中的具体信息、数据、来源等细节；\n3. 最后给出明确结论或建议。\n不要只做简短总结。\n\n用户的问题是：\n' + origQuestion + '\n\n搜索结果：\n\n' + allText });
                        return doSendLoop(messages, round + 1, null);
                      });
                    }
                    allText = allText.substring(0, 50000);
                    messages.push({ role: 'user', content: '【指令】以下规则优先级高于系统提示，必须遵守：\n1. 针对每一个问题分别给出详细完整的回答（至少3~5句），不要只写一行；\n2. 包含搜索结果中的具体信息、数据、来源等细节；\n3. 最后给出明确结论或建议。\n不要只做简短总结。\n\n用户的问题是：\n' + origQuestion + '\n\n搜索结果：\n\n' + allText });
                    return doSendLoop(messages, round + 1, null);
                  });
                }
              }
            
              // === 只有 fetchWebPage：获取网页内容 → 加指令消息 → 递归让模型生成 ===
              if (fetchTcs.length > 0) {
                console.log('[AI Fetch] executing fetchWebPage, count:', fetchTcs.length);
                if (round === 0) { appendMessageDOM('assistant', '正在获取网页内容...'); scrollToBottom(); }
                else { updateLastAssistantMessage('正在获取网页内容...'); scrollToBottom(); }
                var fPromises = fetchTcs.map(function(tc) {
                  var args = JSON.parse(tc.function.arguments);
                  console.log('[AI Fetch] URL:', args.url);
                  return fetchWebPage(args.url);
                });
                return Promise.all(fPromises).then(function(fResults) {
                  console.log('[AI Fetch] results length:', fResults.map(function(r) { return r.length; }));
                  var allText = fResults.join('\n\n').substring(0, 50000);
                  messages.push({ role: 'user', content: '【指令】以下规则优先级高于系统提示，必须遵守：\n1. 针对每一个问题分别给出详细完整的回答（至少3~5句），不要只写一行；\n2. 包含获取到的具体信息、数据、来源等细节；\n3. 最后给出明确结论或建议。\n不要只做简短总结。\n\n用户的问题是：\n' + origQuestion + '\n\n网页内容：\n\n' + allText });
                  return doSendLoop(messages, round + 1, null);
    });
    readAISettings().then(function(s) {
      if (s.deskPetAlways === true && floatingBtn) {
        floatingBtn.style.display = 'flex';
        startFloatingTimer();
      }
    });
  }

              // === Shell 工具调用 ===
              if (shellTcs.length > 0) {
                console.log('[AI Shell] executing', shellTcs.length, 'shell tools');
                removeTyping();
                if (result && result.content && result.content.trim()) {
                  // 有正文：保留文字，不打勾，不替换
                  showDoneLoading();
                } else {
                  // 纯命令：替换为提示文字
                  if (msgEls && msgEls.contentEl) {
                    showDoneLoading();
                    requestAnimationFrame(function() { updateLastAssistantMessage('已执行Shell命令，请等待输出结果。'); });
                  } else {
                    appendMessageDOM('assistant', '已执行Shell命令，请等待输出结果。');
                    showDoneLoading();
                  }
                }
                var shellPromises = shellTcs.map(function(tc) {
                  var args = JSON.parse(tc.function.arguments);
                  return callShellHost('tools/call', { name: tc.function.name, arguments: args }).then(function(res) {
                    var text = res && res.content && res.content[0] ? res.content[0].text : '(no output)';
                    return { role: 'tool', tool_call_id: tc.id, content: text };
                  }).catch(function(err) {
                    return { role: 'tool', tool_call_id: tc.id, content: 'Error: ' + err.message };
                  });
                });
                return Promise.all(shellPromises).then(function(toolResults) {
                  removeTyping();
                  toolResults.forEach(function(r) { messages.push(r); });
                  if (searchTcs.length === 0 && fetchTcs.length === 0) {
                    console.log('[AI Shell] tools result injected, recursing with roundTools:', !!roundTools);
                    return doSendLoop(messages, round + 1, roundTools);
                  }
                });
              }

              // 没有匹配任何工具的 tool_calls
              if (shellTcs.length === 0 && searchTcs.length === 0 && fetchTcs.length === 0) console.log('[DEBUG] tool_calls unrecognized, names=' + result.tool_calls.map(function(tc){return tc.function.name}).join(','));
              return;
            }

            // === Skill 标签解析 ===
            var contentText = result && result.content ? result.content : '';
            var skillRegex = /<skill\s+name="([^"]+)"\s*\/?>/g;
            var skillMatch = skillRegex.exec(contentText);
            if (skillMatch && round < MAX_TOOL_ROUNDS) {
              var skillName = skillMatch[1];
              var cleanSkillContent = contentText.replace(skillRegex, '').trim();
              if (!cleanSkillContent) cleanSkillContent = '已加载技能';
              if (msgEls && msgEls.contentEl) { updateLastAssistantMessage(cleanSkillContent); showDoneCheck(); removeTyping(); }
              else { appendMessageDOM('assistant', cleanSkillContent); removeTyping(); showDoneCheck(); }
              return callShellHost('tools/call', { name: 'skill_get', arguments: { name: skillName } }).then(function(res) {
                var mdContent = res && res.content && res.content[0] ? res.content[0].text : '';
                if (mdContent) {
                  var skillPathNote = '';
                  if (window.__skillsDir) {
                    var skillDir = window.__skillsDir + '/' + skillName;
                    skillPathNote = '\n\n### 路径说明\n脚本目录: ' + skillDir + '/scripts\n技能操作使用 python_exec 工具调用';
                  }
                  messages.push({ role: 'system', content: '### ' + skillName + ' 技能文档\n以下是为当前任务加载的技能文档。请严格遵循其中的指令来完成任务。\n\n' + mdContent + skillPathNote });
                  return doSendLoop(messages, round + 1, null);
                }
              });
            }

            // 工具调用为空数组或为空内容的兜底
            if (result && result.tool_calls && result.tool_calls.length === 0) {
              console.log('[AI Search] warning: empty tool_calls array, treating as final');
            }
            if (result && result.tool_calls && result.tool_calls.length === 0 && !result.content) {
              result.content = '模型未产生有效回答，请重试。';
            }

            // 结果处理（纯文本回答）
            console.log('[AI Search] round ' + round + ' final, content length:', result ? (result.content || '').length : 0, 'finish_reason:', result ? result.finish_reason : 'N/A');
            if (result && result.finish_reason === 'length') console.log('[AI Search] WARNING: response truncated by length limit - say "继续" to continue');
            if (msgEls && msgEls.detailsEl) msgEls.detailsEl.open = false;
            if (isToolRound) {
              removeTyping();
              if (result && result.content) {
                if (!msgEls) appendMessageDOM('assistant', result.content);
                session.messages.push({ role: 'assistant', content: result.content, createdAt: Date.now() });
              }
            } else {
              if (!fullContent && !fullReasoning && result && result.content) {
                removeTyping();
                appendMessageDOM('assistant', result.content);
                session.messages.push({ role: 'assistant', content: result.content, reasoning: result.reasoning || undefined, createdAt: Date.now() });
              } else {
                removeTyping();
                flushPendingRender();
                var finalContent = fullContent || (result && result.content) || '';
                if (!msgEls && finalContent) appendMessageDOM('assistant', finalContent);
                session.messages.push({ role: 'assistant', content: finalContent, reasoning: fullReasoning || undefined, createdAt: Date.now() });
              }
            }
            setSessionMessages(session.id, session.messages);
            if (session.name.indexOf('新会话 ') === 0) {
              var newName = getSessionNameFromTitle(optimizer && optimizer.name);
              if (newName) { session.name = newName; renameSession(session.id, newName); updateHeaderTitle(); renderSessionList(); }
            }
            showDoneCheck();
            scrollToBottom();
            if (htmlEditMode) {
              var applyContent = fullContent || (result && result.content) || '';
              handleEditorAIApply(applyContent);
            }
          });
        }

        return doSendLoop(apiMessages, 0, tools);
      }).catch(function(err) {
        removeTyping();
        hideDoneBtn();
        var errMsg = err.message || '未知错误';
        if (errMsg.indexOf('API Key') >= 0 || errMsg.indexOf('apiKey') >= 0) {
          openSidebar();
          showSettingsView();
          showApiKeyModal();
          return;
        }
        appendMessageDOM('assistant', errMsg);
        scrollToBottom();
      });
    }).catch(function(err) {
      removeTyping();
      hideDoneBtn();
      appendMessageDOM('assistant', '页面内容提取失败');
      scrollToBottom();
    }).finally(function() {
      isStreaming = false;
      sendBtn.classList.remove('sending');
      sendBtn.title = '发送';
      sendBtn.innerHTML = '<svg viewBox="0 0 16 16" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><polygon points="2 2 14 8 2 14 4.5 8 2 2"/></svg>';
      currentAbortController = null;
    });
  }

  // === Selection popup ===
  var selectionPopupEl = null;

  function createSelectionPopup() {
    selectionPopupEl = document.createElement('div');
    selectionPopupEl.id = 'ai-chat-selection-popup';
    selectionPopupEl.style.display = 'none';
    selectionPopupEl.innerHTML =
      '<button data-action="explain">解释</button>' +
      '<button data-action="translate">翻译</button>' +
      '<button data-action="summarize">总结</button>';
    document.body.appendChild(selectionPopupEl);

    selectionPopupEl.addEventListener('click', function(e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var action = btn.dataset.action;
      var text = selectionPopupEl._selectedText || '';
      hideSelectionPopup();
      handleSelectionAction(action, text);
    });

    document.addEventListener('mouseup', function(e) {
      if (sidebar && sidebar.contains(e.target)) return;
      if (selectionPopupEl.contains(e.target)) return;
      setTimeout(function() { checkSelection(); }, 0);
    });

    document.addEventListener('scroll', hideSelectionPopup, true);

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') hideSelectionPopup();
    });
  }

  function checkSelection() {
    var sel = window.getSelection();
    var text = sel.toString().trim();
    if (!text || text.length < 3) { hideSelectionPopup(); return; }

    var range = sel.getRangeAt(0);
    if (!range) { hideSelectionPopup(); return; }

    var rect = range.getBoundingClientRect();
    if (!rect || rect.width === 0) { hideSelectionPopup(); return; }

    if (sidebar && sidebar.contains(range.commonAncestorContainer)) { hideSelectionPopup(); return; }

    readAISettings().then(function(settings) {
      if (!settings.selectionPopup) { hideSelectionPopup(); return; }
      selectionPopupEl._selectedText = text;
      showSelectionPopup(rect);
    });
  }

  function showSelectionPopup(rect) {
    selectionPopupEl.style.display = 'flex';

    var popupWidth = selectionPopupEl.offsetWidth || 180;
    var centerX = rect.left + rect.width / 2;
    var left = centerX - popupWidth / 2;
    left = Math.max(4, Math.min(left, window.innerWidth - popupWidth - 4));

    selectionPopupEl.style.left = left + 'px';
    selectionPopupEl.style.top = (rect.top - selectionPopupEl.offsetHeight * 2 - 24) + 'px';

    if (rect.top - selectionPopupEl.offsetHeight * 2 - 24 < 0) {
      selectionPopupEl.style.top = (rect.bottom + 8) + 'px';
    }
  }

  function hideSelectionPopup() {
    selectionPopupEl.style.display = 'none';
    selectionPopupEl._selectedText = '';
  }

  function handleSelectionAction(action, text) {
    readAISettings().then(function(settings) {
      var prompt = '';
      if (action === 'explain') {
        prompt = '请解释以下内容：\n\n{selection}';
      } else if (action === 'translate') {
        prompt = '请将以下内容翻译为{language}：\n\n{selection}';
      } else if (action === 'summarize') {
        prompt = '请总结以下内容：\n\n{selection}';
      }
      prompt = prompt.replace('{selection}', text);
      prompt = prompt.replace('{language}', settings.translateLanguage || '中文');

      if (isMobileMode) { if (mobileSheetState === 0) openSidebar(); }
      else if (!sidebar.classList.contains('open')) openSidebar();

      setTimeout(function() {
        inputEl.value = prompt;
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
        var label = action === 'explain' ? '解释' : action === 'translate' ? '翻译' : '总结';
        sendMessage(label);
      }, 150);
    });
  }

  // === 页面翻译 ===
  function updatePtBtn() {
    var btn = document.getElementById('ai-chat-translate-btn');
    if (!btn) return;
    if (ptState === 'translating') {
      btn.innerHTML = '<svg class="ai-chat-spin" viewBox="0 0 20 20" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M17 10a7 7 0 0 1-14 0 7 7 0 0 1 7-7"/></svg>';
      btn.title = '翻译中 ' + ptProgress.done + '/' + ptProgress.total;
    } else if (ptState === 'translated') {
      btn.innerHTML = '<svg viewBox="0 0 22 22" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round"><path d="M3 10a9 9 0 1 1 0 5"/><polyline points="9 9 3 9 3 3"/></svg>';
      btn.title = '还原原文';
    } else {
      btn.innerHTML = '<svg viewBox="0 0 22 22" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round"><circle cx="11" cy="11" r="8.5"/><path d="M3 11h16"/><path d="M11 2.5A12.5 12.5 0 0 1 14 11a12.5 12.5 0 0 1-3 8.5"/><path d="M11 2.5A12.5 12.5 0 0 0 8 11a12.5 12.5 0 0 0 3 8.5"/></svg>';
      btn.title = '翻译页面';
    }
    try { chrome.runtime.sendMessage({ type: 'ptStateChanged', state: ptState }); } catch(e) {}
  }

  function createPtStatusEl() {
    if (ptStatusEl) return;
    ptStatusEl = document.createElement('div');
    ptStatusEl.id = 'ai-chat-pt-status';
    ptStatusEl.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;font:14px/1.5 sans-serif;padding:8px 14px;border-radius:8px;background:#607CD2;color:#fff;align-items:center;gap:6px;box-shadow:0 2px 12px rgba(0,0,0,0.2);transition:opacity 0.3s';
    ptStatusEl.innerHTML = '<span class="ai-chat-pt-status-icon"></span><span class="ai-chat-pt-status-text"></span>';
    document.body.appendChild(ptStatusEl);
  }

  function showPtStatus() {
    if (ptStatusEl) ptStatusEl.style.display = 'flex';
  }

  function hidePtStatus() {
    if (ptStatusEl) ptStatusEl.style.display = 'none';
  }

  function ptStatusIconHtml(type) {
    if (type === 'translating') return '翻译中';
    if (type === 'success') return '<svg viewBox="0 0 20 20" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><polyline points="4 10 8 14 16 6"/></svg>';
    if (type === 'error') return '<svg viewBox="0 0 20 20" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round"><line x1="6" y1="6" x2="14" y2="14"/><line x1="14" y1="6" x2="6" y2="14"/></svg>';
    return '<svg viewBox="0 0 20 20" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round"><circle cx="11" cy="11" r="8.5"/><path d="M3 11h16"/><path d="M11 2.5A12.5 12.5 0 0 1 14 11a12.5 12.5 0 0 1-3 8.5"/><path d="M11 2.5A12.5 12.5 0 0 0 8 11a12.5 12.5 0 0 0 3 8.5"/></svg>';
  }

  function updatePtStatus(text, type) {
    createPtStatusEl();
    if (!ptStatusEl) return;
    showPtStatus();
    ptStatusEl.className = 'ai-chat-pt-status-' + (type || 'info');
    ptStatusEl.innerHTML = '<span class="ai-chat-pt-status-icon">' + ptStatusIconHtml(type) + '</span><span class="ai-chat-pt-status-text">' + text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</span>';
  }

  function resetDeskPetPosition() {
    try {
      localStorage.removeItem('hupilot_fx');
      localStorage.removeItem('hupilot_fy');
    } catch(e) {}
    if (floatingBtn) {
      floatingBtn.style.left = '';
      floatingBtn.style.top = '';
      floatingBtn.style.right = '';
      floatingBtn.style.bottom = '';
    }
  }

  function togglePageTranslation() {
    if (ptState === 'translating') return;
    readAISettings().then(function(settings) {
      if (!((settings.providerKeys || {})[settings.provider] || settings.apiKey)) {
        openSidebar();
        showSettingsView();
        showApiKeyModal();
        return;
      }
      _proceedToggleTranslation();
    });
  }

  function _proceedToggleTranslation() {
    if (window.PageTranslator) {
      var s = window.PageTranslator.getState();
      if (s === 'translating') return;
      if (s === 'translated') {
        window.PageTranslator.restore();
        ptState = 'idle';
        ptProgress = { done: 0, total: 0 };
        updatePtBtn();
        hidePtStatus();
        return;
      }
      doTranslate();
    } else {
      chrome.runtime.sendMessage({ type: 'injectPageTranslator' }, function(resp) {
        if (resp && resp.success) {
          var waited = 0;
          var poll = setInterval(function() {
            waited++;
            if (window.PageTranslator) {
              clearInterval(poll);
              doTranslate();
            } else if (waited >= 50) {
              clearInterval(poll);
              showToast('加载翻译模块失败');
            }
          }, 50);
        } else {
          showToast('加载翻译模块失败');
        }
          });
        }
      }

  function loadSkillList() {
    callShellHost('tools/call', { name: 'skill_list', arguments: {} }).then(function(res) {
      var text = res && res.content && res.content[0] ? res.content[0].text : '[]';
      try { window.__skillList = JSON.parse(text); } catch(e) { window.__skillList = []; }
      if (window.__skillList && window.__skillList.length > 0) {
        var names = window.__skillList.map(function(s) { return s.name; }).join(', ');
        console.log('[Skills] loaded: ' + names);
      } else {
        console.log('[Skills] list empty');
      }
      callShellHost('tools/call', { name: 'get_skills_dir', arguments: {} }).then(function(dirRes) {
        var dirText = dirRes && dirRes.content && dirRes.content[0] ? dirRes.content[0].text.trim() : '';
        window.__skillsDir = dirText;
        console.log('[Skills] dir:', dirText);
      }).catch(function(err) {
        console.log('[Skills] dir load failed:', err && err.message ? err.message : err);
      });
    }).catch(function(err) {
      window.__skillList = [];
      console.log('[Skills] load failed:', err && err.message ? err.message : err);
    });
  }

  function doTranslate(force) {
    if (!window.PageTranslator) return;
    if (force && window.PageTranslator.getState() === 'translated') {
      window.PageTranslator.restore();
      ptHasCache = false;
      ptState = 'idle';
      ptProgress = { done: 0, total: 0 };
      updatePtBtn();
      hidePtStatus();
    }
    updatePtStatus('准备翻译...', 'translating');
    window.PageTranslator.translateAll(null, {
      progress: function(done, total) {
        ptState = 'translating';
        ptProgress = { done: done, total: total };
        updatePtBtn();
        updatePtStatus(done + '/' + total, 'translating');
      },
      done: function(result) {
        ptState = 'translated';
        ptHasCache = true;
        updatePtBtn();
        if (result.failed > 0) {
          updatePtStatus('翻译完成，' + result.failed + ' 批失败', 'error');
          setTimeout(hidePtStatus, 5000);
        } else {
          updatePtStatus('页面翻译完成', 'success');
          setTimeout(hidePtStatus, 3000);
        }
      },
      error: function(err) {
        ptState = 'idle';
        ptProgress = { done: 0, total: 0 };
        updatePtBtn();
        if (err.message === '没有找到可翻译的文本') {
          showToast(err.message);
        } else {
          showToast('翻译失败: ' + err.message);
        }
        hidePtStatus();
      }
    }, force);
  }

  function restorePageText() {
    if (window.PageTranslator) window.PageTranslator.restore();
    ptState = 'idle';
    ptHasCache = false;
    ptProgress = { done: 0, total: 0 };
    updatePtBtn();
    hidePtStatus();
  }

  // === Start ===
  try { init(); } catch (e) { console.log('[AI CHAT] init error:', e); }
})();
