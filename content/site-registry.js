// === 网站优化器注册框架 ===

var OPTIMIZERS = [];

function registerOptimizer(pattern, optimizer) {
  OPTIMIZERS.push({ pattern: pattern, optimizer: optimizer });
}

function getOptimizer(url) {
  for (var i = 0; i < OPTIMIZERS.length; i++) {
    if (OPTIMIZERS[i].pattern.test(url)) {
      return OPTIMIZERS[i].optimizer;
    }
  }
  return null;
}

// 递归深克隆，保留 Shadow DOM 内容（open mode）
function cloneWithShadow(node) {
  if (node.nodeType === 3) return node.cloneNode(false);
  if (node.nodeType === 9) {
    var doc = node.cloneNode(false);
    var html = cloneWithShadow(node.documentElement);
    if (html) doc.appendChild(html);
    return doc;
  }
  if (node.nodeType !== 1) return null;
  var clone = node.cloneNode(false);
  var shadowRoot = node.shadowRoot;
  if (shadowRoot && shadowRoot.mode === 'open') {
    Array.from(shadowRoot.childNodes).forEach(function(child) {
      var cc = cloneWithShadow(child);
      if (cc) clone.appendChild(cc);
    });
    // Replace <slot> with assigned light DOM or keep fallback
    var slots = clone.querySelectorAll('slot');
    if (slots.length > 0) {
      var slotList = Array.from(slots);
      for (var si = 0; si < slotList.length; si++) {
        var slot = slotList[si];
        var slotName = slot.getAttribute('name') || '';
        var assigned = [];
        Array.from(node.children).forEach(function(lightChild) {
          var childSlot = lightChild.getAttribute('slot') || '';
          if ((!slotName && !childSlot) || (slotName && childSlot === slotName)) {
            assigned.push(lightChild);
          }
        });
        if (assigned.length > 0) {
          for (var ai = 0; ai < assigned.length; ai++) {
            var ac = cloneWithShadow(assigned[ai]);
            if (ac) slot.parentNode.insertBefore(ac, slot);
          }
        }
        slot.remove();
      }
    }
  } else {
    Array.from(node.childNodes).forEach(function(child) {
      var cc = cloneWithShadow(child);
      if (cc) clone.appendChild(cc);
    });
  }
  return clone;
}

// 克隆 DOM → Defuddle 提取 → 转 Markdown（AI 对话用）
function extractPageContentAsMarkdown(maxChars) {
  return Promise.resolve().then(function() {
    if (typeof Defuddle === 'undefined') {
      return document.body.innerText || document.body.textContent || '';
    }
    var clone = cloneWithShadow(document);
    var sidebarEl = clone.body && clone.body.querySelector('#ai-chat-sidebar');
    if (sidebarEl) sidebarEl.remove();
    var defuddle = new Defuddle(clone, { markdown: true });
    var result;
    try {
      result = defuddle.parse();
    } catch (e) {
      console.warn('Defuddle parse error, falling back to innerText:', e);
      var fallback = clone.body.innerText || clone.body.textContent || document.body.innerText || document.body.textContent || '';
      return fallback.replace(/\s+/g, ' ').trim();
    }
    if (!result || !result.content) {
      var fallback = clone.body.innerText || clone.body.textContent || document.body.innerText || document.body.textContent || '';
      return fallback.replace(/\s+/g, ' ').trim();
    }
    var markdown = result.content;
    if (maxChars && markdown.length > maxChars) {
      markdown = markdown.substring(0, maxChars);
    }
    return markdown;
  });
}

// Turndown 全页 HTML → Markdown（用于"另存为 MD"按钮）
function extractFullPageAsMarkdown(maxChars) {
  if (typeof window.fullPageToMarkdown === 'undefined') {
    return Promise.reject(new Error('TURNDOWN_NOT_LOADED'));
  }
  var clone = cloneWithShadow(document);
  var sidebarEl = clone.body && clone.body.querySelector('#ai-chat-sidebar');
  if (sidebarEl) sidebarEl.remove();
  var defuddle = new Defuddle(clone, { url: document.URL });
  var result = defuddle.parse();
  var html = (result && result.content) || clone.body.innerHTML;
  html = html.replace(/src="data:image\/[^"]+"/gi, '');
  html = html.replace(/src='data:image\/[^']+'/gi, '');
  var md = window.fullPageToMarkdown(html);

  // 拼 YAML frontmatter（与 Obsidian Web Clipper 格式一致）
  if (result) {
    var frontmatter = '---\n';
    if (result.title) { frontmatter += 'title: "' + String(result.title).replace(/"/g, '\\"') + '"\n'; }
    frontmatter += 'source: "' + (result.url || document.URL).replace(/"/g, '\\"') + '"\n';
    if (result.author) { frontmatter += 'author:\n'; frontmatter += '  - "' + String(result.author).replace(/"/g, '\\"') + '"\n'; }
    if (result.published) { frontmatter += 'published: ' + String(result.published) + '\n'; }
    frontmatter += 'created: ' + new Date().toISOString().slice(0, 10) + '\n';
    if (result.description) { frontmatter += 'description: "' + String(result.description).replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"\n'; }
    frontmatter += 'tags:\n';
    frontmatter += '  - "clippings"\n';
    frontmatter += '---\n\n';
    md = frontmatter + md;
  }

  if (maxChars && md.length > maxChars) {
    md = md.substring(0, maxChars);
  }
  return Promise.resolve(md);
}

// 默认页面内容提取器（所有非 optimizer 网站兜底）
function extractPageContent(maxChars) {
  maxChars = maxChars || 50000;
  return extractPageContentAsMarkdown(maxChars);
}
