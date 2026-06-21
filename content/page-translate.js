(function() {
  if (window.PageTranslator) return;

  var state = 'idle';
  var blocks = [];
  var savedNodes = [];
  var progress = { done: 0, total: 0 };
  var BILINGUAL_CLASS = 'hupilot-bilingual-trans';
  var isBilingual = false;
  var transStyle = 'stacked';
  var styleInjected = false;
  var translationCache = {};

  function getStyle(el) {
    if (!el) return null;
    return el._cachedStyle || (el._cachedStyle = (function(e) { try { return window.getComputedStyle(e); } catch(ex) { return null; } })(el));
  }

  function cacheElementStyles(root) {
    var sw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, { acceptNode: function(n) { return NodeFilter.FILTER_ACCEPT; } });
    var el;
    while (el = sw.nextNode()) {
      try { el._cachedStyle = window.getComputedStyle(el); } catch(e) {}
    }
  }

  function injectBilingualStyle(styleName) {
    if (document.getElementById('hupilot-bilingual-style')) return;
    var css = getBilingualCSS(styleName);
    var style = document.createElement('style');
    style.id = 'hupilot-bilingual-style';
    style.textContent = css;
    document.head.appendChild(style);
    injectStyleIntoShadowRoots(document.body, css);
  }

  function getBilingualCSS(styleName) {
    var cssMap = {
      stacked: '.' + BILINGUAL_CLASS + '{display:block;margin:4px 0}',
      underline: '.' + BILINGUAL_CLASS + '{display:block;margin:4px 0;border-bottom:1px solid #72ece9;padding-bottom:2px}',
      nativeUnderline: '.' + BILINGUAL_CLASS + '{display:block;margin:4px 0;text-decoration:underline}',
      dashed: '.' + BILINGUAL_CLASS + '{display:block;margin:4px 0;border:1px dashed #59c1bd;padding:2px 4px;border-radius:3px}',
      dotted: '.' + BILINGUAL_CLASS + '{display:block;margin:4px 0;border:1px dotted #888;padding:2px 4px;border-radius:3px}',
      highlight: '.' + BILINGUAL_CLASS + '{display:block;margin:4px 0;background:#ffff00;padding:2px 4px;border-radius:3px}',
      marker: '.' + BILINGUAL_CLASS + '{display:block;margin:4px 0;background:linear-gradient(180deg,transparent 50%,#ffff0066 50%);padding:2px 4px}',
      grey: '.' + BILINGUAL_CLASS + '{display:block;margin:4px 0;color:#2f4f4f}',
      weakening: '.' + BILINGUAL_CLASS + '{display:block;margin:4px 0;opacity:0.6}',
      bold: '.' + BILINGUAL_CLASS + '{display:block;margin:4px 0;font-weight:bold}',
      italic: '.' + BILINGUAL_CLASS + '{display:block;margin:4px 0;font-style:italic}',
      blockquote: '.' + BILINGUAL_CLASS + '{display:block;margin:4px 0;border-left:3px solid #cc3355;padding-left:8px}',
      paper: '.' + BILINGUAL_CLASS + '{display:block;margin:4px 0;box-shadow:0 1px 3px rgba(0,0,0,0.2);padding:4px 6px;border-radius:3px}',
      background: '.' + BILINGUAL_CLASS + '{display:block;margin:4px 0;background:#dbafaf33;padding:2px 4px;border-radius:3px}',
      dashedBorder: '.' + BILINGUAL_CLASS + '{display:block;margin:4px 0;border:1px dashed #cc3355;padding:2px 4px;border-radius:3px}',
      solidBorder: '.' + BILINGUAL_CLASS + '{display:block;margin:4px 0;border:1px solid #888;padding:2px 4px;border-radius:3px}',
      dividingLine: '.' + BILINGUAL_CLASS + '{display:block;margin:4px 0;border-top:1px solid #ccc;padding-top:4px}'
    };
    return cssMap[styleName] || cssMap.stacked;
  }

  function injectStyleIntoShadowRoots(root, css) {
    var sw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: function(n) { return n.shadowRoot && n.shadowRoot.mode === 'open' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
    });
    var el;
    while (el = sw.nextNode()) {
      if (!el.shadowRoot.getElementById('hupilot-bilingual-style')) {
        var s = el.shadowRoot.createElement('style');
        s.id = 'hupilot-bilingual-style';
        s.textContent = css;
        el.shadowRoot.appendChild(s);
      }
      injectStyleIntoShadowRoots(el.shadowRoot, css);
    }
  }

  function removeBilingualElements() {
    removeBilingualFrom(document.body);
    styleInjected = false;
  }

  function removeBilingualFrom(root) {
    var els = root.querySelectorAll('.' + BILINGUAL_CLASS);
    for (var i = els.length - 1; i >= 0; i--) els[i].remove();
    var styleEls = root.querySelectorAll('style[id="hupilot-bilingual-style"]');
    for (var i = styleEls.length - 1; i >= 0; i--) styleEls[i].remove();
    var sw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: function(n) { return n.shadowRoot && n.shadowRoot.mode === 'open' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
    });
    var el;
    while (el = sw.nextNode()) removeBilingualFrom(el.shadowRoot);
  }

  function getBlockAncestor(el) {
    var current = el;
    for (var i = 0; i < 10; i++) {
      if (!current || current === document.documentElement) break;
      var st = getStyle(current);
      if (st) {
        var d = st.display;
        if (d === 'block' || d === 'flex' || d === 'grid' || d === 'table' || d === 'flow-root' || d === 'list-item') {
          return current;
        }
      }
      current = current.parentElement;
    }
    return el.parentElement;
  }

  function isAdjacentBlocks(a, b) {
    var pa = a.parentElement;
    var pb = b.parentElement;
    if (pa === pb) {
      var s = a.nextSibling;
      while (s && s !== b) {
        if (s.nodeType === 1) {
          if (s.tagName === 'BR') { s = s.nextSibling; continue; }
          var st = getStyle(s);
          if (!st) return false;
          if (['inline','inline-block','inline-flex','inline-grid','inline-table','ruby'].indexOf(st.display) < 0) return false;
        }
        s = s.nextSibling;
      }
      return s === b;
    }
    var container = getBlockAncestor(pa);
    if (!container || container !== getBlockAncestor(pb)) return false;
    function containerChild(el) {
      while (el && el.parentElement && el.parentElement !== container) el = el.parentElement;
      return el;
    }
    var ca = containerChild(a);
    var cb = containerChild(b);
    if (!ca || !cb || ca === cb) return !!ca;
    var s = ca.nextSibling;
    while (s && s !== cb) {
      if (s.nodeType === 1) {
        var st = getStyle(s);
        if (!st) return false;
        if (['inline','inline-block','inline-flex','inline-grid','inline-table','ruby'].indexOf(st.display) < 0) return false;
      }
      s = s.nextSibling;
    }
    return s === cb;
  }

  function extractPageBlocks(root) {
    root = root || document.body;
    cacheElementStyles(root);
    var blocks = [];
    var blocksMap = new Map();
    var walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          var parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          var tag = parent.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'SVG' || tag === 'CODE')
            return NodeFilter.FILTER_REJECT;
          var text = node.textContent;
          if (!text.trim()) return NodeFilter.FILTER_REJECT;
          var style = getStyle(parent);
          if (!style || style.display === 'none' || style.visibility === 'hidden')
            return NodeFilter.FILTER_REJECT;
          if (root === document.body && parent.closest('#ai-chat-sidebar'))
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
      var container = getBlockAncestor(parent);
      var existing = blocksMap.get(container);
      if (existing && isAdjacentBlocks(existing.lastNode, n)) {
        existing.text += n.textContent;
        existing.lastNode = n;
        existing.nodes.push(n);
      } else {
        var block = { nodes: [n], text: n.textContent, lastNode: n };
        blocks.push(block);
        blocksMap.set(container, block);
      }
    }

    var sw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: function(n) { return n.shadowRoot && n.shadowRoot.mode === 'open' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
    });
    var el;
    while (el = sw.nextNode()) {
      blocks = blocks.concat(extractPageBlocks(el.shadowRoot));
    }
    return blocks;
  }

  function isInlineParent(el) {
    if (!el) return false;
    var st = getStyle(el);
    if (!st) return false;
    return ['inline','inline-block','inline-flex','inline-grid'].indexOf(st.display) >= 0;
  }

  function translateOneBatch(batchBlocks, targetLang, settings) {
    var texts = batchBlocks.map(function(b) { return b.text; });
    var allCached = true;
    var cachedTranslations = [];
    var uncachedBlocks = [];
    var uncachedIndices = [];
    texts.forEach(function(t, idx) {
      if (translationCache[t] !== undefined) {
        cachedTranslations[idx] = translationCache[t];
      } else {
        allCached = false;
        cachedTranslations[idx] = undefined;
        uncachedBlocks.push(batchBlocks[idx]);
        uncachedIndices.push(idx);
      }
    });
    if (allCached && uncachedBlocks.length === 0) {
      batchBlocks.forEach(function(block, idx) {
        applyTranslation(block, cachedTranslations[idx]);
      });
      return Promise.resolve(batchBlocks.length);
    }
    if (uncachedBlocks.length === 0) {
      batchBlocks.forEach(function(block, idx) {
        applyTranslation(block, cachedTranslations[idx]);
      });
      return Promise.resolve(batchBlocks.length);
    }
    var combinedText = uncachedBlocks.map(function(b) { return b.text; }).join('\n\n');
    var prompt = 'Translate the text to ' + targetLang + ', please do not explain any sentences, just translate or leave them as they are.\n\n' + combinedText;
    var messages = [
      { role: 'system', content: 'You are a translation engine, you can only translate text and cannot interpret it, and do not explain.' },
      { role: 'user', content: prompt }
    ];
    return callAI(settings, messages, null, null).then(function(result) {
      if (!result) throw new Error('Empty response');
      var translations = result.trim().split('\n\n');
      uncachedBlocks.forEach(function(block, idx) {
        var trans = translations[idx];
        var origIdx = uncachedIndices[idx];
        if (trans && typeof trans === 'string') {
          trans = trans.trim();
          translationCache[block.text] = trans;
          cachedTranslations[origIdx] = trans;
        }
      });
      batchBlocks.forEach(function(block, idx) {
        if (cachedTranslations[idx] !== undefined) {
          applyTranslation(block, cachedTranslations[idx]);
        }
      });
      return batchBlocks.length;
    });
  }

  function applyTranslation(block, trans) {
    if (trans && typeof trans === 'string') {
      if (isBilingual) {
        var lastNode = block.nodes[block.nodes.length - 1];
        if (!lastNode.parentNode) return;
        var transEl = document.createElement('span');
        transEl.className = BILINGUAL_CLASS;
        transEl.textContent = trans;
        if (isInlineParent(lastNode.parentNode)) {
          transEl.style.display = 'inline';
          transEl.style.margin = '0 0 0 4px';
        }
        if (lastNode.nextSibling) {
          lastNode.parentNode.insertBefore(transEl, lastNode.nextSibling);
        } else {
          lastNode.parentNode.appendChild(transEl);
        }
      } else {
        block.nodes.forEach(function(node, ni) {
          if (ni === 0) node.textContent = trans;
          else node.textContent = '';
        });
      }
    }
  }

  function translateAll(targetLang, callbacks, force) {
    return readAISettings().then(function(settings) {
      var targetLangFinal = targetLang || settings.translateLanguage || '中文';
      isBilingual = settings.pageTranslateBilingual === true;
      transStyle = settings.pageTranslateBilingualStyle || 'stacked';

      if (force) translationCache = {};

      if (isBilingual && !styleInjected) {
        injectBilingualStyle(transStyle);
        styleInjected = true;
      }

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
    if (isBilingual) {
      removeBilingualElements();
    }
    savedNodes.forEach(function(item) {
      item.node.textContent = item.original;
    });
    state = 'idle';
    blocks = [];
    savedNodes = [];
    progress = { done: 0, total: 0 };
    isBilingual = false;
  }

  window.PageTranslator = {
    getState: function() { return state; },
    getProgress: function() { return progress; },
    translateAll: translateAll,
    restore: restore
  };
})();
