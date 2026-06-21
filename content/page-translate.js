(function() {
  if (window.PageTranslator) return;

  var state = 'idle';
  var blocks = [];
  var savedNodes = [];
  var progress = { done: 0, total: 0 };

  function extractPageBlocks() {
    var blocks = [];
    var walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          var parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          var tag = parent.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'SVG' || tag === 'CODE' || tag === 'PRE')
            return NodeFilter.FILTER_REJECT;
          var text = node.textContent;
          if (!text.trim()) return NodeFilter.FILTER_REJECT;
          var style;
          try { style = window.getComputedStyle(parent); } catch(e) { return NodeFilter.FILTER_REJECT; }
          if (style.display === 'none' || style.visibility === 'hidden')
            return NodeFilter.FILTER_REJECT;
          if (parent.closest('#ai-chat-sidebar'))
            return NodeFilter.FILTER_REJECT;
          if (text.trim().replace(/[\d\s.,!?;:+\-*/%=()\[\]{}<>@#$^&|~`'\u3000-\u303f\uff00-\uffef\u2026\u2014\u00b7\u2018\u2019\u201c\u201d\u3000\u3001\u3002\uff01\uff0c\uff1b\uff1a\uff08\uff09\u300a\u300b\u300c\u300d\u300e\u300f\u3010\u3011\u25aa\u25ab\u25cf\u25cb]+/g, '').length === 0)
            return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    var n;
    while (n = walker.nextNode()) {
      var parent = n.parentElement;
      if (blocks.length > 0) {
        var last = blocks[blocks.length - 1];
        if (last.parent === parent && last.lastNode.nextSibling === n) {
          last.text += n.textContent;
          last.lastNode = n;
          last.nodes.push(n);
          continue;
        }
        if (last.parent === parent) {
          var onlyInline = true;
          var s = last.lastNode.nextSibling;
          while (s && s !== n) {
            if (s.nodeType === 1) {
              var t = s.tagName;
              if (t === 'BR') { s = s.nextSibling; continue; }
              if (['B','I','U','S','STRONG','EM','SPAN','A','SMALL','SUB','SUP','ABBR','ACRONYM','CITE','CODE','DEL','INS','MARK','Q','TIME','WBR','FONT','BDO','BDI','TT','VAR','KBD','SAMP','NOBR'].indexOf(t) < 0) {
                onlyInline = false; break;
              }
            }
            s = s.nextSibling;
          }
          if (onlyInline && s === n) {
            last.text += n.textContent;
            last.lastNode = n;
            last.nodes.push(n);
            continue;
          }
        }
      }
      blocks.push({ parent: parent, nodes: [n], text: n.textContent, lastNode: n });
    }
    return blocks;
  }

  function translateOneBatch(batchBlocks, targetLang, settings) {
    var texts = batchBlocks.map(function(b) { return b.text; });
    var escaped = texts.map(function(t) {
      return t.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r');
    });
    var prompt = 'Translate the following segments to ' + targetLang + '. Preserve all numbers, special characters, and whitespace exactly. Return ONLY a valid JSON array of translated strings, one per input segment.\n\nInput segments:\n' + escaped.map(function(t, i) { return (i + 1) + '. "' + t + '"'; }).join('\n') + '\n\nOutput:';
    var messages = [
      { role: 'system', content: 'You are a translator. Respond only with valid JSON.' },
      { role: 'user', content: prompt }
    ];
    return callAI(settings, messages, null, null).then(function(result) {
      if (!result) throw new Error('Empty response');
      var json;
      var m = result.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
      if (m) { json = m[1]; }
      else { m = result.match(/\[[\s\S]*\]/); if (m) json = m[0]; }
      if (!json) throw new Error('Could not parse translation result');
      var translations = JSON.parse(json);
      batchBlocks.forEach(function(block, idx) {
        var trans = translations[idx];
        if (trans && typeof trans === 'string') {
          block.nodes.forEach(function(node, ni) {
            if (ni === 0) node.textContent = trans;
            else node.textContent = '';
          });
        }
      });
      return batchBlocks.length;
    });
  }

  function translateAll(targetLang, callbacks) {
    return readAISettings().then(function(settings) {
      var targetLangFinal = targetLang || settings.translateLanguage || '中文';
      var batchSize = 25;
      var concurrency = 2;
      var MAX_RETRIES = 2;

      blocks = extractPageBlocks();
      savedNodes = [];
      progress = { done: 0, total: blocks.length };

      if (blocks.length === 0) {
        state = 'idle';
        if (callbacks && callbacks.error) callbacks.error(new Error('没有找到可翻译的文本'));
        return;
      }

      state = 'translating';
      if (callbacks && callbacks.progress) callbacks.progress(0, blocks.length);

      blocks.forEach(function(b) {
        b.nodes.forEach(function(node) {
          savedNodes.push({ node: node, original: node.textContent });
        });
      });

      var batches = [];
      for (var i = 0; i < blocks.length; i += batchSize) {
        batches.push(blocks.slice(i, i + batchSize));
      }

      var queue = batches.map(function(b) { return { batchBlocks: b, retries: 0 }; });
      var inFlight = 0;
      var failed = 0;

      return new Promise(function(resolve) {
        function processNext() {
          while (inFlight < concurrency && queue.length > 0) {
            var item = queue.shift();
            inFlight++;
            (function(item) {
              translateOneBatch(item.batchBlocks, targetLangFinal, settings).then(function(count) {
                progress.done += count;
                if (callbacks && callbacks.progress) callbacks.progress(progress.done, progress.total);
              }).catch(function() {
                if (item.retries < MAX_RETRIES) {
                  item.retries++;
                  queue.push(item);
                } else {
                  failed++;
                }
              }).finally(function() {
                inFlight--;
                processNext();
              });
            })(item);
          }
          if (inFlight === 0 && queue.length === 0) {
            state = 'translated';
            if (callbacks && callbacks.done) callbacks.done({ count: blocks.length, failed: failed });
            resolve({ count: blocks.length, failed: failed });
          }
        }
        processNext();
      });
    }).catch(function(err) {
      state = 'idle';
      if (callbacks && callbacks.error) callbacks.error(err);
    });
  }

  function restore() {
    savedNodes.forEach(function(item) {
      item.node.textContent = item.original;
    });
    state = 'idle';
    blocks = [];
    savedNodes = [];
    progress = { done: 0, total: 0 };
  }

  window.PageTranslator = {
    getState: function() { return state; },
    getProgress: function() { return progress; },
    translateAll: translateAll,
    restore: restore
  };
})();
