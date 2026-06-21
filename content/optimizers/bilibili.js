// === Bilibili 字幕获取模块 ===

registerOptimizer(/bilibili\.com\/video\//, {
  getSubtitle: getBilibiliSubtitles,
  getVideoInfo: getBilibiliVideoInfo,
  extractContent: extractBilibiliContent,
  getQuickActions: getBilibiliQuickActions
});

function isBilibiliVideo() {
  return /bilibili\.com\/video\//.test(window.location.href);
}

// 通过 background 获取字幕
function getBilibiliSubtitles() {
  return new Promise(function(resolve, reject) {
    chrome.runtime.sendMessage({
      type: 'bilibiliSubtitle'
    }, function(response) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError.message);
      } else {
        resolve(response);
      }
    });
  });
}

function getBilibiliVideoInfo() {
  return { isBilibili: /bilibili\.com\/video\//.test(window.location.href) };
}

function extractBilibiliContent(maxChars) {
  maxChars = maxChars || 50000;
  return extractPageContentAsMarkdown(maxChars);
}

// B 站快捷操作
function getBilibiliQuickActions() {
  return [{
    id: 'bilibili_summary',
    label: '总结视频',
    getPrompt: function() {
      return new Promise(function(resolve) {
        var retries = 0;
        function tryFetch() {
          getBilibiliSubtitles().then(function(data) {
            // 已返回确定结果（无论有没有字幕）
            if (data && data.error !== 'not_ready') {
              if (data.subtitles && data.subtitles.length > 0) {
                buildPrompt(data).then(resolve);
              } else {
                resolve('该视频暂无可用字幕，请确认视频已开启字幕功能。');
              }
              return;
            }
            // 尚未准备好，重试
            retries++;
            if (retries >= 10) {
              resolve('字幕加载超时，请刷新页面后重试');
              return;
            }
            setTimeout(tryFetch, 2000);
          }).catch(function() {
            retries++;
            if (retries >= 10) {
              resolve('获取字幕失败，请刷新页面后重试');
              return;
            }
            setTimeout(tryFetch, 2000);
          });
        }
        tryFetch();
      });
    }
  }];
}

function buildPrompt(data) {
  var title = data.title || '';
  var bvid = data.bvid || '';
  var text = '视频标题：' + title + '\nBVID：' + bvid + '\n';
  if (data.author) {
    text += 'UP主：' + (data.author.name || '未知') + '\n';
  }
  text += '\n';
  var sub = data.subtitles[0];
  if (sub.error) {
    text += '字幕（' + sub.lan_doc + '）获取失败：' + sub.error + '\n';
  } else {
    text += '--- 字幕（' + sub.lan_doc + '）共 ' + sub.total + ' 条 ---\n';
    sub.segments.forEach(function(seg) {
      text += '[' + seg.from.toFixed(1) + 's→' + seg.to.toFixed(1) + 's] ' + seg.text + '\n';
    });
  }
  if (title) {
    return Promise.resolve('请根据视频标题和字幕内容对视频进行中文总结，包括主要内容、关键观点和亮点：\n\n' + text);
  }
  return Promise.resolve('请根据以下字幕内容对视频进行中文总结：\n\n' + text);
}