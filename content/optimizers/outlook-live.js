// === Outlook (个人版) 邮件优化器 ===
// 匹配 outlook.live.com / outlook.com

function cleanRecipientText(raw) {
  if (!raw) return '';
  var text = raw.replace(/[\ue000-\uf8ff]/g, ', ').replace(/[\u200B\u00A0]/g, '');
  return text.replace(/, +/g, ', ').replace(/,\s*,/g, ',').replace(/,+$/, '').replace(/^,/, '').trim();
}

function getComposeRecipient(includeCc, includeBcc) {
  var toField = document.querySelector('[contenteditable][aria-label="收件人"]');
  var toText = toField ? cleanRecipientText(toField.textContent || '') : '';
  var parts = [];
  if (toText) parts.push('收件人：' + toText);
  if (includeCc !== false) {
    var ccField = document.querySelector('[contenteditable][aria-label="抄送"]');
    var ccText = ccField ? cleanRecipientText(ccField.textContent || '') : '';
    if (ccText) parts.push('抄送：' + ccText);
  }
  if (includeBcc === true) {
    var bccField = document.querySelector('[contenteditable][aria-label="密件抄送"]');
    var bccText = bccField ? cleanRecipientText(bccField.textContent || '') : '';
    if (bccText) parts.push('密件抄送：' + bccText);
  }
  return parts.join('；');
}

registerOptimizer(
  /^https:\/\/(outlook\.live\.com|outlook\.com)\/mail\//,
  {
    name: 'Outlook 邮箱（个人版）',

    getComposeRecipient: getComposeRecipient,

    extractContent: function() {
      return readAISettings().then(function(settings) {
        function q(sel) { return document.querySelector(sel) || null; }
        function qt(sel) { var e = q(sel); return e ? e.textContent.trim() : ''; }

        var subject = '';
        var from = '';
        var date = '';
        var to = '';
        var body = '';

        var mainEl = q('[role="main"]');
        if (mainEl) {
          var headings = mainEl.querySelectorAll('h3');
          for (var i = 0; i < headings.length; i++) {
            var text = headings[i].textContent.trim();
            if (text.startsWith('发件人:')) {
              from = text.replace('发件人:', '').trim();
            } else if (text.startsWith('收件人:')) {
              to = text.replace('收件人:', '').trim();
            } else if (subject && text !== subject) {
              date = text;
            } else {
              subject = text;
            }
          }

          var bodyEl = mainEl.querySelector('[role="document"]');
          if (bodyEl) body = bodyEl.innerText || bodyEl.textContent || '';
        }

        if (!body) {
          var allText = mainEl ? (mainEl.innerText || mainEl.textContent || '') : '';
          if (allText.length > subject.length) body = allText;
        }

        var content = '';
        if (subject) content += '主题：' + subject + '\n';
        if (from) content += '发件人：' + from + '\n';
        if (to) content += '原收件人：' + to + '\n';
        if (date) content += '时间：' + date + '\n';
        if (body) content += '\n邮件正文：\n' + body.trim();

        var composeRecipient = getComposeRecipient(settings.outlookReplyCcEnabled, settings.outlookReplyBccEnabled);
        if (composeRecipient) {
          content += '\n\n当前写信收件人：' + composeRecipient;
        }

        return content || extractPageContent();
      });
    },

    getQuickActions: function() {
      return [
        {
          id: 'summary',
          label: '总结',
          prompt: '这是新的邮件，请对邮件进行总结，突出重点信息：\n\n{content}'
        },
        {
          id: 'reply',
          label: '回复',
          prompt: '这是邮件内容和当前写信收件人信息。用不超过 3 个简洁的要点概括关键信息，然后使用此邮件语言撰写一份发给上述收件人的快速回复草稿，回复内容要符合我语气和意图，必要时做出合理的假设：\n\n{content}'
        },
        {
          id: 'keypoints',
          label: '要点',
          prompt: '这是新的邮件，请提取邮件的关键要点，以简洁的列表形式呈现，并给出管理视角的高价值关注点：\n\n{content}'
        },
        {
          id: 'translate',
          label: '翻译',
          prompt: '这是新的邮件，请将邮件内容翻译为{language}：\n\n{content}'
        }
      ];
    },

    getSystemPrompt: function() {
      return '你是一个邮件助手，可以帮助用户处理邮件，并给用户提供管理上的帮助和支持。请基于邮件内容给出准确、专业的回答，并给出管理视角的专业建议和提醒。';
    },

    onUrlChange: function() {
      return true;
    }
  }
);
