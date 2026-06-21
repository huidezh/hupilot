// === Bilibili 字幕预捕获拦截器（MAIN world，document_start） ===
(function() {
  if (window.__BILI_INTERCEPTOR__) return;
  window.__BILI_INTERCEPTOR__ = true;

var origFetch = window.fetch.bind(window);
window.fetch = function(u, o) {
  return origFetch(u, o).then(function(r) {
    if (typeof u === 'string' && u.indexOf('player/wbi/v2') >= 0) {
      captureSubtitleResponse(r.clone());
    }
    return r;
  });
};

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

function captureSubtitleResponse(resp) {
  resp.json().then(function(b) {
    if (b.code !== 0 || !b.data || !b.data.subtitle) {
      window.__BILI_SUBTITLE_CACHE__ = { aid: (b.data||{}).aid, cid: (b.data||{}).cid, subtitles: [] };
      return;
    }
    var ss = b.data.subtitle.subtitles;
    if (!ss || !ss.length) {
      window.__BILI_SUBTITLE_CACHE__ = { aid: b.data.aid, cid: b.data.cid, subtitles: [] };
      return;
    }
    var chinesePriority = ['zh-Hans', 'zh-CN', 'zh-SG', 'zh-MY', 'zh-Hant', 'zh-HK', 'zh-TW', 'zh', 'ai-zh'];
    var best = null, bestScore = 999;
    for (var i = 0; i < ss.length; i++) {
      if (!ss[i].subtitle_url) continue;
      var idx = chinesePriority.indexOf(ss[i].lan);
      var score = idx >= 0 ? idx : 100;
      if (score < bestScore) { bestScore = score; best = ss[i]; }
    }
    if (!best) {
      window.__BILI_SUBTITLE_CACHE__ = { aid: b.data.aid, cid: b.data.cid, subtitles: [] };
      return;
    }
    var su = best.subtitle_url.startsWith('//') ? 'https:' + best.subtitle_url : best.subtitle_url;
    origFetch(su).then(function(r2) { return r2.json(); }).then(function(d) {
      var sg = (d.body || []).map(function(x) { return { from: x.from, to: x.to, text: x.content }; });
      window.__BILI_SUBTITLE_CACHE__ = { aid: b.data.aid, cid: b.data.cid, subtitles: [{ lan: best.lan, lan_doc: best.lan_doc, segments: sg, total: sg.length }] };
      window.postMessage({ type: 'biliSubtitleReady' }, '*');
    }).catch(function() {});
  }).catch(function() {});
}
})();
