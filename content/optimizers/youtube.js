registerOptimizer(/youtube\.com/, {
  getSubtitle: getYoutubeSubtitles,
  getVideoInfo: getYoutubeVideoInfo,
  extractContent: extractYoutubeContent,
  getQuickActions: getYoutubeQuickActions
});

function isYoutubeVideo() {
  return /youtube\.com\/(watch\?|shorts\/)/.test(window.location.href);
}

function getYoutubeSubtitles() {
  return new Promise(function(resolve, reject) {
    chrome.runtime.sendMessage({
      type: 'youtubeSubtitle'
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.log('[YT-CS] sendMessage error:', chrome.runtime.lastError.message);
        reject(chrome.runtime.lastError.message);
      } else {
        console.log('[YT-CS] response:', response ? (response.error || 'subtitles:' + (response.subtitles ? response.subtitles.length : 0)) : 'undefined');
        resolve(response);
      }
    });
  });
}

function getYoutubeVideoInfo() {
  return { isYoutube: isYoutubeVideo() };
}

function extractYoutubeContent(maxChars) {
  maxChars = maxChars || 50000;
  return extractPageContentAsMarkdown(maxChars);
}

function getYoutubeQuickActions() {
  return [{
    id: 'youtube_summary',
    label: '总结视频',
    getPrompt: function() {
      return new Promise(function(resolve) {
        var retries = 0;
        function tryFetch() {
          getYoutubeSubtitles().then(function(data) {
            if (data && data.error !== 'not_ready') {
              if (data.subtitles && data.subtitles.length > 0) {
                buildYtPrompt(data).then(resolve);
              } else {
                resolve('该视频暂无可用字幕，请确认视频已开启字幕功能。');
              }
              return;
            }
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

function buildYtPrompt(data) {
  var title = data.title || document.title.replace(' - YouTube', '') || '';
  var text = '视频标题：' + title + '\n';
  if (data.author) {
    text += '频道：' + (data.author.name || data.author) + '\n';
  }
  text += '\n';
  var sub = data.subtitles[0];
  if (sub.error) {
    text += '字幕获取失败：' + sub.error + '\n';
  } else {
    text += '--- 字幕（' + sub.lan + '）共 ' + sub.total + ' 条 ---\n';
    sub.segments.forEach(function(seg) {
      text += '[' + seg.from.toFixed(1) + 's→' + seg.to.toFixed(1) + 's] ' + seg.text + '\n';
    });
  }
  if (title) {
    return Promise.resolve('请根据视频标题和字幕内容对视频进行中文总结，包括主要内容、关键观点和亮点：\n\n' + text);
  }
  return Promise.resolve('请根据以下字幕内容对视频进行中文总结：\n\n' + text);
}
