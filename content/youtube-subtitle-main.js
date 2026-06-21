(function() {
  if (window.__YT_INTERCEPTOR__) return;
  window.__YT_INTERCEPTOR__ = true;

  var langPriority = ['zh-Hans', 'zh-CN', 'zh-SG', 'zh-MY', 'zh-Hant', 'zh-HK', 'zh-TW', 'zh', 'en'];

  function pickUrlLang(url) {
    var m = url.match(/[?&]lang=([a-zA-Z-]+)/);
    return m ? m[1] : null;
  }

  function currentVideoId() {
    var m = window.location.href.match(/[?&]v=([^&]+)/);
    if (m) return m[1];
    m = window.location.href.match(/\/shorts\/([^/?]+)/);
    return m ? m[1] : null;
  }

  function isVideoMatch(url) {
    var expected = currentVideoId();
    if (!expected) return true;
    var m = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
    return m && m[1] === expected;
  }

  function langScore(code) {
    var exact = langPriority.indexOf(code);
    if (exact >= 0) return exact;
    var prefix = code.split('-')[0];
    for (var i = 0; i < langPriority.length; i++) {
      if (langPriority[i].indexOf(prefix + '-') === 0 || langPriority[i] === prefix) return i;
    }
    return 999;
  }

  function pickBestCaptionTrack(tracks) {
    var best = null, bestScore = 999;
    for (var i = 0; i < tracks.length; i++) {
      var t = tracks[i], code = t.languageCode || '';
      var score = langScore(code);
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  function tryPlayerResponse(body) {
    try {
      var json = JSON.parse(body);
    } catch(e) { return; }
    var cr = json && json.captions && json.captions.playerCaptionsTracklistRenderer;
    if (!cr || !cr.captionTracks || !cr.captionTracks.length) return;
    var track = pickBestCaptionTrack(cr.captionTracks);
    if (!track) return;
    var url = track.baseUrl;
    if (!url) return;
    var lang = track.languageCode || 'en';
    if (!isVideoMatch(url)) return;
    origFetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 'fmt=json3').then(function(r) {
      if (r.ok) return r.text();
    }).then(function(t) {
      if (t && isVideoMatch(url)) tryCache(t, lang);
    });
  }

  function parseSrv3(body) {
    try {
      var json = JSON.parse(body);
    } catch(e) { return null; }
    if (!json.events || !json.events.length) return null;
    var segs = [];
    for (var i = 0; i < json.events.length; i++) {
      var ev = json.events[i];
      if (!ev.segs || !ev.segs.length || ev.tStartMs == null) continue;
      var text = '';
      for (var j = 0; j < ev.segs.length; j++) {
        if (ev.segs[j].utf8) text += ev.segs[j].utf8;
      }
      if (!text.trim()) continue;
      segs.push({
        from: ev.tStartMs / 1000,
        to: (ev.tStartMs + (ev.dDurationMs || 0)) / 1000,
        text: text.trim()
      });
    }
    return segs.length ? segs : null;
  }

  function addJson3(url) {
    if (url.indexOf('fmt=') >= 0) url = url.replace(/[?&]fmt=[^&]*/, '');
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'fmt=json3';
  }

  function tryCache(jsonBody, lang) {
    var segs = parseSrv3(jsonBody);
    if (!segs) return false;
    var cur = window.__YT_SUBTITLE_CACHE__;
    var curScore = cur ? langScore(cur._lan || '') : 999;
    if (langScore(lang) <= curScore) {
      window.__YT_SUBTITLE_CACHE__ = {
        _lan: lang,
        subtitles: [{ lan: lang, segments: segs, total: segs.length }]
      };
      window.postMessage({ type: 'ytSubtitleReady' }, '*');
    }
    return true;
  }

  function tryCacheJson3(url, lang) {
    var json3url = addJson3(url);
    origFetch(json3url).then(function(r) {
      if (r.ok) return r.text();
    }).then(function(t) {
      if (t && isVideoMatch(url)) tryCache(t, lang);
    });
  }

  var origFetch = window.fetch.bind(window);
  window.fetch = function(u, o) {
    return origFetch(u, o).then(function(r) {
      if (typeof u === 'string') {
        if (u.indexOf('api/timedtext') >= 0) {
          if (!isVideoMatch(u)) return r;
          var lang = pickUrlLang(u);
          if (lang) {
            r.clone().text().then(function(t) {
              if (isVideoMatch(u)) tryCache(t, lang);
            });
          }
        } else if (u.indexOf('youtubei/v1/player') >= 0) {
          r.clone().text().then(function(t) {
            if (t && t.indexOf('captionTracks') > 0) tryPlayerResponse(t);
          });
        }
      }
      return r;
    });
  };

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'ytClearSubtitleCache') {
      window.__YT_SUBTITLE_CACHE__ = null;
    }
  });

  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    var isTimedtext = typeof url === 'string' && url.indexOf('api/timedtext') >= 0;
    var isPlayer = typeof url === 'string' && url.indexOf('youtubei/v1/player') >= 0;
    this._ytTimedtextUrl = isTimedtext ? url : null;
    this._ytPlayerUrl = isPlayer ? url : null;
    return origOpen.apply(this, arguments);
  };

  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() {
    this.addEventListener('load', function() {
      if (this.readyState === 4) {
        if (this._ytTimedtextUrl && this.responseText) {
          if (!isVideoMatch(this._ytTimedtextUrl)) return;
          var lang = pickUrlLang(this._ytTimedtextUrl);
          if (lang) {
            var ok = tryCache(this.responseText, lang);
            if (!ok) tryCacheJson3(this._ytTimedtextUrl, lang);
          }
        } else if (this._ytPlayerUrl && this.responseText && this.responseText.indexOf('captionTracks') > 0) {
          tryPlayerResponse(this.responseText);
        }
      }
    });
    return origSend.apply(this, arguments);
  };
})();
