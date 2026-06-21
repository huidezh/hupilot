(function () {
  if (!location.hostname.includes('outlook.cloud.microsoft') && !location.hostname.includes('outlook.live.com') && !location.hostname.includes('outlook.com') && !location.hostname.includes('outlook.office.com')) return;

  var COMPOSE_SEL = 'div[role="textbox"][aria-label="邮件正文"]';
  var SEND_BTN_SEL = 'button[aria-label="发送"]';
  var SEND_MORE_SEL = 'button[aria-label="更多发送选项"]';
  var SUBJECT_SEL = 'input[aria-label="主题"]';
  var BTN_ID = 'hupilot-outlook-reply-btn';
  var BTN2_ID = 'hupilot-outlook-reply-plus-btn';
  var DIALOG_ID = 'hupilot-outlook-reply-dialog';

  function monitorComposeArea() {
    var target = document.body || document.documentElement;
    var observer = new MutationObserver(function () {
      var composeArea = document.querySelector(COMPOSE_SEL);
      if (composeArea) {
        injectReplyButton(composeArea);
      } else {
        removeButton();
      }
    });
    observer.observe(target, { childList: true, subtree: true });
    var composeArea = document.querySelector(COMPOSE_SEL);
    if (composeArea) injectReplyButton(composeArea);
  }

  function makeBtn(text, bg, hoverBg, icon) {
    var b = document.createElement('button');
    var img = document.createElement('img');
    img.src = chrome.runtime.getURL(icon);
    img.style.cssText = 'width:24px;height:24px;';
    b.appendChild(img);
    b.appendChild(document.createTextNode(text));
    b.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;margin-left:8px;background:' + bg + ';color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;white-space:nowrap;';
    b.onmouseenter = function () { b.style.background = hoverBg; };
    b.onmouseleave = function () { b.style.background = bg; };
    return b;
  }

  function injectReplyButton(composeArea) {
    if (composeArea.getAttribute('data-hp-injected')) return;
    composeArea.setAttribute('data-hp-injected', '1');
    var refBtn = document.querySelector(SEND_MORE_SEL) || document.querySelector(SEND_BTN_SEL);
    if (!refBtn) return;

    readAISettings().then(function (s) {
      if (s.outlookReplyBtn !== false) {
        var btn = makeBtn('回复', '#607CD2', '#4A64B8', 'icons/icon48.png');
        btn.id = BTN_ID;
        btn.onclick = function () { generateReply(composeArea, btn); };
        refBtn.parentNode.insertBefore(btn, refBtn.nextSibling);
      }

      if (s.outlookReplyPlusBtn !== false) {
        var btn2 = makeBtn('回复+', '#5588C0', '#3C6FA8', 'icons/icon48-2.png');
        btn2.id = BTN2_ID;
        btn2.onclick = function () { generateReplyWithInput(composeArea, btn2); };
        var anchor = document.getElementById(BTN_ID) || refBtn;
        anchor.parentNode.insertBefore(btn2, anchor.nextSibling);
      }
    });
  }

  function removeButton() {
    var btn = document.getElementById(BTN_ID);
    if (btn) btn.remove();
    var btn2 = document.getElementById(BTN2_ID);
    if (btn2) btn2.remove();
  }

  function cleanRecipientText(raw) {
    if (!raw) return '';
    var text = raw.replace(/[\ue000-\uf8ff]/g, ', ').replace(/[\u200B\u00A0]/g, '');
    return text.replace(/, +/g, ', ').replace(/,\s*,/g, ',').replace(/,+$/, '').replace(/^,/, '').trim();
  }

  function extractToName(recipientInfo) {
    if (!recipientInfo) return '';
    var m = recipientInfo.match(/收件人：(.+?)(?:；|$)/);
    if (!m) return '';
    var raw = m[1].trim();
    var angle = raw.indexOf('<');
    return angle > 0 ? raw.substring(0, angle).trim() : raw;
  }

  function getRecipientInfo(includeCc, includeBcc) {
    var toEl = document.querySelector('[contenteditable][aria-label="收件人"]');
    var parts = [];
    if (toEl) {
      var t = cleanRecipientText(toEl.textContent || '');
      if (t) parts.push('收件人：' + t);
    }
    if (includeCc !== false) {
      var ccEl = document.querySelector('[contenteditable][aria-label="抄送"]');
      if (ccEl) {
        var c = cleanRecipientText(ccEl.textContent || '');
        if (c) parts.push('抄送：' + c);
      }
    }
    if (includeBcc === true) {
      var bccEl = document.querySelector('[contenteditable][aria-label="密件抄送"]');
      if (bccEl) {
        var b = cleanRecipientText(bccEl.textContent || '');
        if (b) parts.push('密件抄送：' + b);
      }
    }
    return parts.join('；');
  }

  function extractEmailContext() {
    var subject = '';
    var subjEl = document.querySelector(SUBJECT_SEL);
    if (subjEl) subject = (subjEl.value || subjEl.textContent || '').trim();

    var participants = [];
    document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
      participants.push(a.textContent.trim() || a.getAttribute('href'));
    });

    var body = '';
    var typedText = '';
    var composeArea = document.querySelector(COMPOSE_SEL);
    if (composeArea) {
      typedText = composeArea.innerText || composeArea.textContent || '';
      var container = composeArea.closest('[role="main"], section, article') || composeArea.parentElement;
      if (container) {
        var full = container.innerText || container.textContent || '';
        if (typedText && full.indexOf(typedText) >= 0) {
          body = full.replace(typedText, '').trim();
        } else {
          body = full.trim();
        }
      }
    }

    return { subject: subject, participants: participants, body: body, typedText: typedText };
  }

  function doAI(composeArea, btn, userContent) {
    var origHTML = btn.innerHTML;
    btn.innerHTML = '生成中…';
    btn.disabled = true;

    readAISettings()
      .then(function (settings) {
        if (!settings.outlookUserInfo || !settings.outlookUserInfo.trim()) {
          btn.innerHTML = origHTML;
          btn.disabled = false;
          showOutlookUserInfoModal();
          return Promise.reject('USER_INFO_MISSING');
        }
        var ctx = extractEmailContext();
        var contextText = '标题：' + ctx.subject;
        var recipientInfo = getRecipientInfo(settings.outlookReplyCcEnabled, settings.outlookReplyBccEnabled);
        if (recipientInfo) {
          contextText += '\n本次邮件回复收件人：' + recipientInfo.replace(/^收件人：/, '');
        }
        contextText += '\n\n邮件正文：\n' + (ctx.body || '(无法提取邮件正文内容)');

        var systemPrompt = settings.outlookReplyPrompt || '你的名字叫虎宝，你是一个邮件助手。请基于邮件内容给出准确、专业的回答。不要使用markdown格式，直接输出纯文本。';

        var messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ];

        return callAI(settings, messages, null, null, null);
      })
      .then(function (reply) {
        if (typeof reply === 'object') {
          btn.innerHTML = origHTML;
          btn.disabled = false;
          return;
        }
        insertReply(composeArea, reply || '');
        btn.innerHTML = origHTML;
        btn.disabled = false;
      })
      .catch(function (err) {
        if (err !== 'USER_INFO_MISSING') console.error('[Hupilot] AI reply error:', err);
        btn.innerHTML = origHTML;
        btn.disabled = false;
      });
  }

  function generateReply(composeArea, btn) {
    readAISettings().then(function(settings) {
      var ctx = extractEmailContext();
      var contextText = '标题：' + ctx.subject + '\n\n邮件正文：\n' + (ctx.body || '(无法提取邮件正文内容)');
      var recipientInfo = getRecipientInfo(settings.outlookReplyCcEnabled, settings.outlookReplyBccEnabled);
      var userInstruction = '请以用户的身份写一封回复，用户为【' + settings.outlookUserInfo.trim() + '】，回复内容要符合用户语气和意图。直接输出邮件正文，不要加"收件人"/"抄送"等收件人信息头。';
      var parts = ['原始邮件内容：\n' + contextText];
      if (recipientInfo) {
        parts.push('本次邮件回复收件人：' + recipientInfo.replace(/^收件人：/, ''));
      }
      parts.push(userInstruction);
      doAI(composeArea, btn, parts.join('\n\n'));
    });
  }

  function generateReplyWithInput(composeArea, btn) {
    if (document.getElementById(DIALOG_ID)) return;
    var overlay = document.createElement('div');
    overlay.id = DIALOG_ID;
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);z-index:999999;display:flex;align-items:center;justify-content:center;';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:8px;padding:20px;min-width:400px;max-width:600px;box-shadow:0 4px 20px rgba(0,0,0,0.15);';
    var title = document.createElement('div');
    title.textContent = '输入邮件要点';
    title.style.cssText = 'font-size:16px;font-weight:bold;margin-bottom:12px;color:#333;';
    var textarea = document.createElement('textarea');
    textarea.style.cssText = 'width:100%;min-height:120px;border:1px solid #ccc;border-radius:4px;padding:8px;font-size:14px;box-sizing:border-box;resize:vertical;';
    textarea.placeholder = '请描述希望邮件包含的内容…';
    textarea.focus();
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:12px;';
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = 'padding:6px 16px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;';
    cancelBtn.onclick = function () { overlay.remove(); };
    var sendBtn = document.createElement('button');
    sendBtn.textContent = '发送';
    sendBtn.style.cssText = 'padding:6px 16px;border:none;border-radius:4px;background:#607CD2;color:white;cursor:pointer;font-size:13px;';
    sendBtn.onclick = function () {
      var val = textarea.value.trim();
      if (!val) return;
      overlay.remove();
      readAISettings().then(function(settings) {
        var ctx = extractEmailContext();
        var contextText = '标题：' + ctx.subject + '\n\n邮件正文：\n' + (ctx.body || '(无法提取邮件正文内容)');
        var recipientInfo = getRecipientInfo(settings.outlookReplyCcEnabled, settings.outlookReplyBccEnabled);
        var toName = extractToName(recipientInfo);
        var header = '';
        if (recipientInfo) {
          header += '\n本次邮件回复收件人：' + recipientInfo.replace(/^收件人：/, '');
        }
        header += '\n\n用户希望邮件的大致内容：\n' + val;
        header += '\n\n注意：以上是用户想在邮件里表达的大致内容，"你/你们/您"指的是收件人，"我/我们"指的是用户。';
        header += '\n\n根据以上的信息，请以用户的身份写一封回复，用户为【' + settings.outlookUserInfo.trim() + '】，回复内容要符合用户语气和意图。直接输出邮件正文，不要加"收件人"/"抄送"等收件人信息头。';
        doAI(composeArea, btn, '---\n原始邮件内容：\n' + contextText + '\n---' + header);
      });
    };
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(sendBtn);
    box.appendChild(title);
    box.appendChild(textarea);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function insertReply(composeArea, text) {
    composeArea.focus();
    var sel = document.getSelection();
    var range;
    if (sel.rangeCount > 0 && composeArea.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0);
    } else {
      range = document.createRange();
      range.setStart(composeArea, 0);
      range.collapse(true);
    }
    var fragment = document.createDocumentFragment();
    var lines = text.split('\n');
    var nodes = [];
    for (var i = 0; i < lines.length; i++) {
      var div = document.createElement('div');
      div.textContent = lines[i] || '\u00A0';
      nodes.push(div);
      fragment.appendChild(div);
    }
    range.deleteContents();
    range.insertNode(fragment);
    var lastDiv = nodes[nodes.length - 1];
    range.setStartAfter(lastDiv);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    composeArea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function insertHtmlReply(composeArea, html) {
    composeArea.focus();
    var sel = document.getSelection();
    var range;
    if (sel.rangeCount > 0 && composeArea.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0);
    } else {
      range = document.createRange();
      range.setStart(composeArea, 0);
      range.collapse(true);
    }
    range.deleteContents();
    var temp = document.createElement('div');
    temp.innerHTML = html;
    var fragment = document.createDocumentFragment();
    while (temp.firstChild) {
      fragment.appendChild(temp.firstChild);
    }
    range.insertNode(fragment);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    composeArea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function showOutlookUserInfoModal() {
    var overlay = document.createElement('div');
    overlay.id = 'hupilot-outlook-userinfo-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);z-index:999999;display:flex;align-items:center;justify-content:center;';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:8px;padding:24px;min-width:360px;max-width:500px;box-shadow:0 4px 20px rgba(0,0,0,0.15);text-align:center;';
    var msg = document.createElement('p');
    msg.style.cssText = 'margin:0 0 20px 0;font-size:14px;color:#333;line-height:1.6;text-align:left;';
    msg.textContent = '为了更好地使用Outlook相关的AI功能，请在设置中填写您的相关信息，例如：姓名、邮箱地址、职位、性别。以上信息保存在本地，仅在邮箱的相关AI功能中使用。';
    var confirmBtn = document.createElement('button');
    confirmBtn.textContent = '确认';
    confirmBtn.style.cssText = 'padding:8px 24px;border:none;border-radius:4px;background:#607CD2;color:white;cursor:pointer;font-size:14px;';
    confirmBtn.onclick = function () { overlay.remove(); };
    box.appendChild(msg);
    box.appendChild(confirmBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  monitorComposeArea();

  window.hupilotInsertIntoCompose = function (text) {
    var el = document.querySelector(COMPOSE_SEL);
    if (!el) return false;
    insertReply(el, text);
    return true;
  };

  window.hupilotInsertHtmlIntoCompose = function (html) {
    var el = document.querySelector(COMPOSE_SEL);
    if (!el) return false;
    insertHtmlReply(el, html);
    return true;
  };
})();
