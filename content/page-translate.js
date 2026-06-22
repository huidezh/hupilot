// === Constants (dom-labels.ts) ===
var CONTENT_WRAPPER_CLASS = 'htp-content-wrapper';
var INLINE_CONTENT_CLASS = 'htp-inline-content';
var BLOCK_CONTENT_CLASS = 'htp-block-content';
var FLOAT_WRAP_ATTRIBUTE = 'data-htp-float-wrap';
var WALKED_ATTRIBUTE = 'data-htp-w';
var PARAGRAPH_ATTRIBUTE = 'data-htp-p';
var BLOCK_ATTRIBUTE = 'data-htp-b';
var INLINE_ATTRIBUTE = 'data-htp-i';
var TRANSLATION_MODE_ATTRIBUTE = 'data-htp-m';
var MARK_ATTRIBUTES = new Set([WALKED_ATTRIBUTE, PARAGRAPH_ATTRIBUTE, BLOCK_ATTRIBUTE, INLINE_ATTRIBUTE]);
var NOTRANSLATE_CLASS = 'notranslate';
var CUSTOM_TRANSLATION_NODE_ATTRIBUTE = 'data-htp-custom-translation-style';

// === Tag sets (dom-rules.ts) ===
var FORCE_BLOCK_TAGS = new Set([
  'BODY', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BR', 'FORM', 'SELECT', 'BUTTON', 'LABEL',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE',
  'ARTICLE', 'SECTION', 'FIGURE', 'FIGCAPTION',
  'HEADER', 'FOOTER', 'MAIN', 'NAV',
]);

var DONT_WALK_AND_TRANSLATE_TAGS = new Set([
  'HEAD', 'TITLE', 'HR', 'INPUT', 'TEXTAREA', 'IMG',
  'VIDEO', 'AUDIO', 'CANVAS', 'SOURCE', 'TRACK',
  'META', 'SCRIPT', 'NOSCRIPT', 'STYLE', 'LINK',
  'RT', 'RP', 'PRE', 'svg',
]);

var DONT_WALK_BUT_TRANSLATE_TAGS = new Set(['CODE', 'TIME']);

var FORCE_INLINE_TRANSLATION_TAGS = new Set(['A', 'BUTTON', 'SELECT', 'OPTION', 'SPAN']);

var MAIN_CONTENT_IGNORE_TAGS = new Set(['HEADER', 'FOOTER', 'NAV', 'NOSCRIPT']);

// === DOM utilities ===

// ---- Filter functions (filter.ts) ----

function isHTMLElement(node) {
  return node.nodeType === Node.ELEMENT_NODE
    && node.nodeName !== undefined
    && 'tagName' in node
    && 'getAttribute' in node
    && 'setAttribute' in node;
}

function isTextNode(node) {
  return node.nodeType === Node.TEXT_NODE
    && 'textContent' in node
    && 'data' in node;
}

function isElement(node) {
  return node.nodeType === Node.ELEMENT_NODE;
}

function isTransNode(node) {
  return isHTMLElement(node) || isTextNode(node);
}

function isShallowInlineHTMLElement(element) {
  if (!element.textContent?.trim()) return false;
  if (FORCE_BLOCK_TAGS.has(element.tagName)) return false;
  var display = window.getComputedStyle(element).display;
  var normalized = display.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'contents') return true;
  if (normalized.startsWith('inline')) return true;
  return ['ruby', 'ruby-base', 'ruby-text', 'ruby-base-container', 'ruby-text-container'].includes(normalized);
}

function isShallowBlockHTMLElement(element) {
  var display = window.getComputedStyle(element).display;
  if (FORCE_BLOCK_TAGS.has(element.tagName)) return true;
  var normalized = display.trim().toLowerCase();
  if (!normalized) return false;
  return !(normalized === 'contents' || normalized.startsWith('inline') ||
    ['ruby', 'ruby-base', 'ruby-text', 'ruby-base-container', 'ruby-text-container'].includes(normalized));
}

function isInlineTransNode(node) {
  if (isTextNode(node)) return true;
  return node.hasAttribute(INLINE_ATTRIBUTE);
}

function isBlockTransNode(node) {
  if (isTextNode(node)) return false;
  return node.hasAttribute(BLOCK_ATTRIBUTE);
}

function isCustomForceBlockTranslation(element) {
  return false;
}

function isDontWalkIntoButTranslateAsChildElement(element) {
  return element.classList.contains(NOTRANSLATE_CLASS) || DONT_WALK_BUT_TRANSLATE_TAGS.has(element.tagName);
}

function isDontWalkIntoAndDontTranslateAsChildElement(element) {
  var tag = DONT_WALK_AND_TRANSLATE_TAGS.has(element.tagName);
  var css = window.getComputedStyle(element).display === 'none' || window.getComputedStyle(element).visibility === 'hidden';
  var hidden = element.hidden;
  var ariaHidden = element.getAttribute('aria-hidden') === 'true';
  var visuallyHidden = ['sr-only', 'visually-hidden'].some(function(cls) { return element.classList.contains(cls); });
  return tag || css || hidden || ariaHidden || visuallyHidden;
}

function isTranslatedWrapperNode(node) {
  return isHTMLElement(node) && node.classList.contains(CONTENT_WRAPPER_CLASS);
}

function isTranslatedContentNode(node) {
  return isHTMLElement(node) && (node.classList.contains(BLOCK_CONTENT_CLASS) || node.classList.contains(INLINE_CONTENT_CLASS));
}

function isIFrameElement(node) {
  return node.nodeType === Node.ELEMENT_NODE && node.nodeName === 'IFRAME';
}

function isEditable(element) {
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
}

// ---- Node utilities (node.ts) ----

function getOwnerDocument(node) {
  return node.ownerDocument || document;
}

function getContainingShadowRoot(node) {
  var root = node.getRootNode();
  return root instanceof ShadowRoot ? root : null;
}

// ---- Batch DOM (batch-dom.ts) ----

function DOMBatcher() {
  this.operations = [];
  this.rafId = null;
  this.isProcessing = false;
}

DOMBatcher.prototype.queue = function(operation) {
  this.operations.push(operation);
  this.scheduleFlush();
};

DOMBatcher.prototype.scheduleFlush = function() {
  var self = this;
  if (this.rafId !== null || this.isProcessing) return;
  this.rafId = requestAnimationFrame(function() {
    self.flush();
  });
};

DOMBatcher.prototype.flush = function() {
  this.rafId = null;
  if (this.operations.length === 0) return;
  this.isProcessing = true;
  var ops = this.operations.splice(0);
  for (var i = 0; i < ops.length; i++) {
    try { ops[i](); } catch (e) { console.error('DOMBatcher error:', e); }
  }
  this.isProcessing = false;
  if (this.operations.length > 0) this.scheduleFlush();
};

DOMBatcher.prototype.flushImmediate = function() {
  if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  this.rafId = null;
  while (this.operations.length > 0) { this.flush(); }
};

var domBatcher = new DOMBatcher();

function batchDOMOperation(operation) {
  domBatcher.queue(operation);
}

function flushBatchedOperations() {
  domBatcher.flushImmediate();
}

// ---- Style (style.ts) ----

function smashTruncationStyle(element) {
  if (typeof window === 'undefined') return;

  var scheduleIdleTask = function(callback) {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(callback);
    } else if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(callback);
    } else {
      setTimeout(callback, 0);
    }
  };

  scheduleIdleTask(function() {
    var computedStyle = window.getComputedStyle(element);
    if (computedStyle.webkitLineClamp && computedStyle.webkitLineClamp !== 'none') {
      element.style.webkitLineClamp = 'unset';
    }
    if (computedStyle.maxHeight && computedStyle.maxHeight !== 'none') {
      element.style.maxHeight = 'unset';
    }
    if (computedStyle.textOverflow === 'ellipsis') {
      element.style.textOverflow = 'unset';
    }
  });
}

// ---- Find (find.ts) ----

function unwrapDeepestOnlyHTMLChild(element) {
  var currentElement = element;
  while (currentElement) {
    smashTruncationStyle(currentElement);

    var shouldKeepNode = function(child) {
      if (!child.textContent?.trim()) return false;
      if (child.nodeType === Node.TEXT_NODE) return true;
      return isHTMLElement(child) && !isDontWalkIntoAndDontTranslateAsChildElement(child);
    };

    var effectiveChildNodes = [];
    for (var ci = 0; ci < currentElement.childNodes.length; ci++) {
      var c = currentElement.childNodes[ci];
      if (shouldKeepNode(c)) effectiveChildNodes.push(c);
    }

    var effectiveChildren = effectiveChildNodes.filter(function(n) { return n.nodeType === Node.ELEMENT_NODE; });

    if (!(effectiveChildren.length === 1 && effectiveChildNodes.length === 1)) break;

    var onlyChildElement = effectiveChildren[0];
    if (!isHTMLElement(onlyChildElement)) break;

    currentElement = onlyChildElement;
  }
  return currentElement;
}

// ---- Traversal (traversal.ts) ----

var NON_NEWLINE_WHITESPACE_RE = /[^\S\n]/;

function extractTextContent(node) {
  if (isTextNode(node)) {
    var text = node.textContent ?? '';
    var trimmed = text.trim();
    if (trimmed === '') return ' ';
    var leadingWs = text.slice(0, text.length - text.trimStart().length);
    var trailingWs = text.slice(text.trimEnd().length);
    var hasLeading = NON_NEWLINE_WHITESPACE_RE.test(leadingWs);
    var hasTrailing = NON_NEWLINE_WHITESPACE_RE.test(trailingWs);
    return (hasLeading ? ' ' : '') + trimmed + (hasTrailing ? ' ' : '');
  }

  if (isHTMLElement(node) && node.tagName === 'BR') return '\n';

  if (isDontWalkIntoAndDontTranslateAsChildElement(node)) return '';

  var childNodes = node.childNodes;
  var result = '';
  for (var i = 0; i < childNodes.length; i++) {
    var child = childNodes[i];
    if (isTextNode(child) || isHTMLElement(child)) {
      result += extractTextContent(child);
    }
  }
  return result;
}

function walkAndLabelElement(element, walkId) {
  if (isDontWalkIntoButTranslateAsChildElement(element) || isDontWalkIntoAndDontTranslateAsChildElement(element)) {
    return { forceBlock: false, isInlineNode: false };
  }

  element.setAttribute(WALKED_ATTRIBUTE, walkId);

  if (element.shadowRoot) {
    var shadowChildren = element.shadowRoot.children;
    for (var si = 0; si < shadowChildren.length; si++) {
      if (isHTMLElement(shadowChildren[si])) {
        walkAndLabelElement(shadowChildren[si], walkId);
      }
    }
  }

  var validChildNodes = [];
  for (var ci = 0; ci < element.childNodes.length; ci++) {
    var child = element.childNodes[ci];
    if (child.nodeType === Node.TEXT_NODE) {
      validChildNodes.push(child);
    } else if (isHTMLElement(child)) {
      if (!isDontWalkIntoButTranslateAsChildElement(child) && !isDontWalkIntoAndDontTranslateAsChildElement(child)) {
        validChildNodes.push(child);
      }
    }
  }

  var hasInlineNodeChild = false;
  var forceBlock = false;

  for (var vi = 0; vi < validChildNodes.length; vi++) {
    var vc = validChildNodes[vi];
    if (vc.nodeType === Node.TEXT_NODE) {
      if (vc.textContent?.trim()) hasInlineNodeChild = true;
      continue;
    }
    if (isHTMLElement(vc)) {
      var result = walkAndLabelElement(vc, walkId);
      forceBlock = forceBlock || result.forceBlock;
      if (result.isInlineNode) hasInlineNodeChild = true;
    }
  }

  if (hasInlineNodeChild) element.setAttribute(PARAGRAPH_ATTRIBUTE, '');

  forceBlock = forceBlock || FORCE_BLOCK_TAGS.has(element.tagName);

  if (element.textContent?.trim() === '' && !forceBlock) {
    return { forceBlock: false, isInlineNode: false };
  }

  var isInlineNode = isShallowInlineHTMLElement(element);

  if (isShallowBlockHTMLElement(element) || forceBlock || isCustomForceBlockTranslation(element)) {
    element.setAttribute(BLOCK_ATTRIBUTE, '');
  } else if (isInlineNode) {
    element.setAttribute(INLINE_ATTRIBUTE, '');
  }

  return { forceBlock: forceBlock, isInlineNode: isInlineNode };
}

// === Translation state (translation-state.ts) ===

var translatingNodes = new WeakSet();
var originalContentMap = new Map();
var MARK_ATTRIBUTES_REGEX = new RegExp('\\s*(?:' + [...MARK_ATTRIBUTES].join('|') + ')(?:=[\'"][^\'"]*[\'"]|=[^\\s>]*)?', 'g');

// === Translation utilities ===

// ---- Text preparation (text-preparation.ts) ----

var INVISIBLE_TRANSLATION_CHARACTERS_REGEX = /[\u200B-\u200D\uFEFF]/g;

function prepareTranslationText(value) {
  return value?.replace(INVISIBLE_TRANSLATION_CHARACTERS_REGEX, '').trim() ?? '';
}

// ---- Translation utils (translation-utils.ts) ----

var NUMERIC_PATTERN = /^[\d\s,.-]+$/;
var CONTAINS_DIGIT_RE = /\d/;

function isNumericContent(text) {
  var cleanedText = text.trim();
  if (!cleanedText) return false;
  if (!NUMERIC_PATTERN.test(cleanedText)) return false;
  return CONTAINS_DIGIT_RE.test(cleanedText);
}

function isForceInlineTranslation(targetNode) {
  if (isHTMLElement(targetNode)) {
    var computedStyle = window.getComputedStyle(targetNode);
    return FORCE_INLINE_TRANSLATION_TAGS.has(targetNode.tagName) || computedStyle.display.includes('flex');
  }
  return false;
}

// ---- Filter small paragraph (filter-small-paragraph.ts) ----

function shouldFilterSmallParagraph(text, minCharactersPerNode) {
  if (minCharactersPerNode > 0 && text.length < minCharactersPerNode) return true;
  return false;
}

// ---- Display translation ----

function getDisplayTranslation(sourceText, translatedText) {
  if (translatedText === undefined) return undefined;
  return prepareTranslationText(sourceText) === prepareTranslationText(translatedText) ? '' : translatedText;
}

// === Spinner (spinner.ts) ===

function createLightweightSpinner(ownerDoc) {
  var spinner = ownerDoc.createElement('span');
  spinner.className = 'htp-spinner';
  spinner.style.cssText = [
    'display: inline-block !important',
    'width: 6px !important',
    'height: 6px !important',
    'min-width: 6px !important',
    'min-height: 6px !important',
    'max-width: 6px !important',
    'max-height: 6px !important',
    'aspect-ratio: 1 / 1 !important',
    'margin: 0 4px !important',
    'padding: 0 !important',
    'vertical-align: middle !important',
    'border: 1.5px solid transparent !important',
    'border-top: 1.5px solid var(--htp-muted-foreground) !important',
    'border-radius: 50% !important',
    'box-sizing: content-box !important',
    'flex-shrink: 0 !important',
    'flex-grow: 0 !important',
    'align-self: center !important',
  ].join('; ');

  var prefersReducedMotion = ownerDoc.defaultView?.matchMedia
    ? ownerDoc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  if (!prefersReducedMotion && spinner.animate) {
    spinner.animate(
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
      { duration: 600, iterations: Infinity, easing: 'linear' }
    );
  } else {
    spinner.style.borderTopColor = 'var(--htp-muted-foreground)';
  }

  return spinner;
}

function createSpinnerInside(translatedWrapperNode) {
  var ownerDoc = getOwnerDocument(translatedWrapperNode);
  var root = getContainingShadowRoot(translatedWrapperNode) ?? ownerDoc;
  ensurePresetStyles(root);
  var spinner = createLightweightSpinner(ownerDoc);
  translatedWrapperNode.appendChild(spinner);
  return spinner;
}

// ---- Simplified getTranslatedTextAndRemoveSpinner (no React) ----

async function getTranslatedTextAndRemoveSpinner(nodes, textContent, spinner, translatedWrapperNode, preTranslatedText) {
  var translatedText;
  try {
    if (preTranslatedText !== undefined) {
      translatedText = preTranslatedText;
    } else {
      translatedText = await translateTextForPage(textContent);
    }
  } catch (error) {
    var errorNode = document.createElement('span');
    errorNode.textContent = '[翻译错误]';
    errorNode.style.cssText = 'color:#e74c3c;font-size:12px;vertical-align:middle;';
    translatedWrapperNode.appendChild(errorNode);
  } finally {
    spinner.remove();
  }
  return translatedText;
}

// === Style injector (style-injector.ts) ===

var HOST_THEME_CSS = [
  ':root {',
  '  --htp-primary: oklch(0.205 0 0);',
  '  --htp-brand: oklch(76.034% 0.12361 82.191);',
  '  --htp-foreground: oklch(0.985 0 0);',
  '  --htp-muted: oklch(0.97 0 0);',
  '  --htp-muted-foreground: oklch(0.556 0 0);',
  '}',
  '@media (prefers-color-scheme: dark) {',
  '  :root {',
  '    --htp-primary: oklch(0.922 0 0);',
  '    --htp-brand: oklch(76.034% 0.12361 82.191);',
  '    --htp-foreground: oklch(0.205 0 0);',
  '    --htp-muted: oklch(0.269 0 0);',
  '    --htp-muted-foreground: oklch(0.708 0 0);',
  '  }',
  '}',
].join('\n');

var TRANSLATION_NODE_PRESET_CSS = [
  '.' + CONTENT_WRAPPER_CLASS + ',',
  '.' + CONTENT_WRAPPER_CLASS + ' * {',
  '  overflow-wrap: anywhere;',
  '  word-break: normal;',
  '  user-select: text;',
  '  text-decoration-skip-ink: auto;',
  '}',
  '',
  '.' + BLOCK_CONTENT_CLASS + ' {',
  '  display: inline-block;',
  '  margin: 8px 0 !important;',
  '  color: inherit;',
  '  font-family: inherit;',
  '}',
  '',
  '.' + BLOCK_CONTENT_CLASS + '[' + FLOAT_WRAP_ATTRIBUTE + '="true"] {',
  '  display: block !important;',
  '}',
  '',
  '.' + INLINE_CONTENT_CLASS + ' {',
  '  display: inline;',
  '  color: inherit;',
  '  font-family: inherit;',
  '  text-decoration: inherit;',
  '}',
  '',
  '[' + CUSTOM_TRANSLATION_NODE_ATTRIBUTE + '="blur"] {',
  '  filter: blur(4px);',
  '  opacity: 0.75;',
  '  transition: filter 0.1s ease-in-out, opacity 0.1s ease-in-out;',
  '}',
  '[' + CUSTOM_TRANSLATION_NODE_ATTRIBUTE + '="blur"]:hover {',
  '  filter: blur(0);',
  '  opacity: 1;',
  '}',
  '',
  '.' + BLOCK_CONTENT_CLASS + '[' + CUSTOM_TRANSLATION_NODE_ATTRIBUTE + '="blockquote"] {',
  '  border-left: 4px solid var(--htp-brand);',
  '  padding: 4px 0 4px 8px;',
  '}',
  '',
  '[' + CUSTOM_TRANSLATION_NODE_ATTRIBUTE + '="weakened"] {',
  '  opacity: 1;',
  '  color: var(--htp-muted-foreground) !important;',
  '}',
  '',
  '[' + CUSTOM_TRANSLATION_NODE_ATTRIBUTE + '="dashedLine"] {',
  '  text-decoration: underline dashed var(--htp-brand) !important;',
  '  text-underline-offset: 5px;',
  '}',
  '',
  '[' + CUSTOM_TRANSLATION_NODE_ATTRIBUTE + '="border"] {',
  '  border: 1px solid var(--htp-brand);',
  '  padding: 2px 4px;',
  '  border-radius: 4px;',
  '}',
  '',
  '[' + CUSTOM_TRANSLATION_NODE_ATTRIBUTE + '="textColor"] {',
  '  color: #607CD2 !important;',
  '}',
  '',
  '[' + CUSTOM_TRANSLATION_NODE_ATTRIBUTE + '="background"] {',
  '  background-color: color-mix(in srgb, var(--htp-brand) 15%, transparent);',
  '  padding: 2px 4px;',
  '  border-radius: 4px;',
  '}',
  '',
  '.' + CONTENT_WRAPPER_CLASS + '[lang="zh"],',
  '.' + CONTENT_WRAPPER_CLASS + '[lang="zh"] * {',
  '  font-family: "PingFang SC", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans SC", "Heiti SC", "WenQuanYi Micro Hei", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;',
  '}',
  '',
  '.' + CONTENT_WRAPPER_CLASS + '[lang="zh-TW"],',
  '.' + CONTENT_WRAPPER_CLASS + '[lang="zh-TW"] * {',
  '  font-family: "PingFang TC", "Microsoft JhengHei", "Source Han Sans TC", "Noto Sans TC", "Heiti TC", "STHeiti", "STXihei", "Hiragino Sans TC", "WenQuanYi Zen Hei", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;',
  '}',
  '',
  '.' + CONTENT_WRAPPER_CLASS + '[lang="ja"],',
  '.' + CONTENT_WRAPPER_CLASS + '[lang="ja"] * {',
  '  font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "YuGothic", "Meiryo", "Noto Sans JP", "Source Han Sans JP", "MS PGothic", "MS Gothic", "IPAexGothic", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif;',
  '}',
  '',
  '.' + CONTENT_WRAPPER_CLASS + '[lang="ar"],',
  '.' + CONTENT_WRAPPER_CLASS + '[lang="ar"] *,',
  '.' + CONTENT_WRAPPER_CLASS + '[lang="fa"],',
  '.' + CONTENT_WRAPPER_CLASS + '[lang="fa"] *,',
  '.' + CONTENT_WRAPPER_CLASS + '[lang="ur"],',
  '.' + CONTENT_WRAPPER_CLASS + '[lang="ur"] * {',
  '  font-feature-settings: "rlig" 1, "calt" 1;',
  '}',
  '',
  '.' + CONTENT_WRAPPER_CLASS + '[lang="ar"],',
  '.' + CONTENT_WRAPPER_CLASS + '[lang="ar"] * {',
  '  font-family: "SF Arabic", "Noto Sans Arabic", "Noto Naskh Arabic", "Geeza Pro", "Traditional Arabic", "Segoe UI", Tahoma, Arial, sans-serif;',
  '}',
  '',
  '.' + CONTENT_WRAPPER_CLASS + '[lang="fa"],',
  '.' + CONTENT_WRAPPER_CLASS + '[lang="fa"] * {',
  '  font-family: "SF Arabic", "Noto Sans Arabic", "Geeza Pro", "Iranian Sans", "Segoe UI", Tahoma, Arial, sans-serif !important;',
  '}',
  '',
  '.' + CONTENT_WRAPPER_CLASS + '[lang="ur"],',
  '.' + CONTENT_WRAPPER_CLASS + '[lang="ur"] * {',
  '  font-family: "Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "SF Arabic", "Noto Sans Arabic", "Alvi Nastaleeq", "Segoe UI", Tahoma, Arial, sans-serif;',
  '}',
].join('\n');

var injectedPresetRoots = new WeakSet();

function ensurePresetStyles(root) {
  if (injectedPresetRoots.has(root)) return;
  injectedPresetRoots.add(root);

  var css = HOST_THEME_CSS + '\n' + TRANSLATION_NODE_PRESET_CSS;

  if (root instanceof ShadowRoot) {
    css = css.replace(/:root/g, ':host');
  }

  var container = root instanceof Document ? root.head : root;
  var existing = root.querySelector('#htp-preset-styles');
  if (!existing) {
    var style = document.createElement('style');
    style.id = 'htp-preset-styles';
    container.appendChild(style);
    existing = style;
  }
  existing.textContent = css;
}

// ---- Decorate translation node (decorate-translation.ts) ----

function decorateTranslationNode(translatedNode, styleConfig) {
  var root = getContainingShadowRoot(translatedNode) ?? document;

  if (styleConfig && styleConfig !== 'default') {
    translatedNode.setAttribute(CUSTOM_TRANSLATION_NODE_ATTRIBUTE, styleConfig);
  }
  ensurePresetStyles(root);
}

// === Translation wrapper management ===

// ---- Translation wrapper (translation-wrapper.ts) ----

function findPreviousTranslatedWrapperInside(node, walkId) {
  if (isHTMLElement(node)) {
    if (node.classList.contains(CONTENT_WRAPPER_CLASS) && node.getAttribute(WALKED_ATTRIBUTE) !== walkId) {
      return node;
    }
    return node.querySelector('.' + CONTENT_WRAPPER_CLASS + ':not([' + WALKED_ATTRIBUTE + '="' + walkId + '"])');
  }
  return null;
}

// ---- Translation insertion (translation-insertion.ts) ----

function isFloatedElement(element) {
  var floatValue = window.getComputedStyle(element).float;
  return floatValue === 'left' || floatValue === 'right';
}

function hasVisibleLayoutBox(element) {
  var rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findActiveFloatSibling(paragraphElement) {
  var flowContainer = paragraphElement.parentElement;
  if (!flowContainer) return null;

  var paragraphRect = paragraphElement.getBoundingClientRect();

  for (var si = 0; si < flowContainer.children.length; si++) {
    var sibling = flowContainer.children[si];
    if (!isHTMLElement(sibling)) continue;
    if (sibling === paragraphElement || sibling.contains(paragraphElement)) continue;

    var floatCandidates = [sibling];
    var innerElements = sibling.querySelectorAll('*');
    for (var ii = 0; ii < innerElements.length; ii++) {
      if (isHTMLElement(innerElements[ii])) floatCandidates.push(innerElements[ii]);
    }

    for (var fi = 0; fi < floatCandidates.length; fi++) {
      var candidate = floatCandidates[fi];
      if (!isHTMLElement(candidate)) continue;
      if (!isFloatedElement(candidate) || !hasVisibleLayoutBox(candidate)) continue;
      var floatRect = candidate.getBoundingClientRect();
      var verticallyAffects = paragraphRect.top < floatRect.bottom - 1 && paragraphRect.bottom > floatRect.top + 1;
      if (verticallyAffects) return candidate;
    }
  }

  return null;
}

function shouldWrapInsideFloatFlow(targetNode) {
  var paragraphElement = isHTMLElement(targetNode)
    ? (targetNode.hasAttribute(PARAGRAPH_ATTRIBUTE) ? targetNode : targetNode.closest('[' + PARAGRAPH_ATTRIBUTE + ']'))
    : targetNode.parentElement?.closest('[' + PARAGRAPH_ATTRIBUTE + ']');
  if (!paragraphElement) return false;
  var activeFloat = findActiveFloatSibling(paragraphElement);
  return !!activeFloat;
}

function addInlineTranslation(ownerDoc, translatedWrapperNode, translatedNode) {
  var spaceNode = ownerDoc.createElement('span');
  spaceNode.textContent = '  ';
  translatedWrapperNode.appendChild(spaceNode);
  translatedNode.className = NOTRANSLATE_CLASS + ' ' + INLINE_CONTENT_CLASS;
}

function addBlockTranslation(ownerDoc, translatedWrapperNode, translatedNode) {
  var brNode = ownerDoc.createElement('br');
  translatedWrapperNode.appendChild(brNode);
  translatedNode.className = NOTRANSLATE_CLASS + ' ' + BLOCK_CONTENT_CLASS;
}

function insertTranslatedNodeIntoWrapper(translatedWrapperNode, targetNode, translatedText, translationNodeStyle, forceBlockTranslation) {
  var ownerDoc = getOwnerDocument(translatedWrapperNode);
  var translatedNode = ownerDoc.createElement('span');
  var forceInlineTranslationResult = isForceInlineTranslation(targetNode);
  var customForceBlock = isHTMLElement(targetNode) && isCustomForceBlockTranslation(targetNode);

  if (customForceBlock) {
    addBlockTranslation(ownerDoc, translatedWrapperNode, translatedNode);
  } else if (forceInlineTranslationResult) {
    addInlineTranslation(ownerDoc, translatedWrapperNode, translatedNode);
  } else if (forceBlockTranslation) {
    addBlockTranslation(ownerDoc, translatedWrapperNode, translatedNode);
  } else if (isInlineTransNode(targetNode)) {
    addInlineTranslation(ownerDoc, translatedWrapperNode, translatedNode);
  } else if (isBlockTransNode(targetNode)) {
    addBlockTranslation(ownerDoc, translatedWrapperNode, translatedNode);
  } else {
    return;
  }

  translatedNode.textContent = translatedText;
  translatedWrapperNode.appendChild(translatedNode);
  decorateTranslationNode(translatedNode, translationNodeStyle);

  if (translatedNode.classList.contains(BLOCK_CONTENT_CLASS) && shouldWrapInsideFloatFlow(targetNode)) {
    translatedNode.setAttribute(FLOAT_WRAP_ATTRIBUTE, 'true');
  }
}

// ---- Translation cleanup (translation-cleanup.ts) ----

function removeShadowHostInTranslatedWrapper(wrapper) {
  var spinner = wrapper.querySelector('.htp-spinner');
  if (spinner) {
    batchDOMOperation(function() { spinner.remove(); });
  }
}

function removeTranslatedWrapperWithRestore(wrapper) {
  removeShadowHostInTranslatedWrapper(wrapper);

  var translationMode = wrapper.getAttribute(TRANSLATION_MODE_ATTRIBUTE);

  if (translationMode === 'translationOnly') {
    var currentNode = wrapper.parentNode;
    while (currentNode && isHTMLElement(currentNode)) {
      var originalContent = originalContentMap.get(currentNode);
      if (originalContent) {
        (function(nodeToRestore, content) {
          batchDOMOperation(function() {
            nodeToRestore.innerHTML = content;
          });
        })(currentNode, originalContent);
        originalContentMap.delete(currentNode);
        return;
      }
      currentNode = currentNode.parentNode;
    }
  }

  batchDOMOperation(function() { wrapper.remove(); });
}

function removeAllTranslatedWrapperNodes(root) {
  root = root || document;
  var translatedNodes = deepQueryTopLevelSelector(root, isTranslatedWrapperNode);
  translatedNodes.forEach(function(contentWrapperNode) {
    removeTranslatedWrapperWithRestore(contentWrapperNode);
  });
}

function deepQueryTopLevelSelector(element, selectorFn) {
  if (element instanceof Document) {
    return deepQueryTopLevelSelector(element.body, selectorFn);
  }

  var result = [];
  if (element instanceof ShadowRoot) {
    for (var sci = 0; sci < element.children.length; sci++) {
      if (isHTMLElement(element.children[sci])) {
        result.push.apply(result, deepQueryTopLevelSelector(element.children[sci], selectorFn));
      }
    }
    return result;
  }

  if (selectorFn(element)) return [element];

  if (element.shadowRoot) {
    for (var shc = 0; shc < element.shadowRoot.children.length; shc++) {
      if (isHTMLElement(element.shadowRoot.children[shc])) {
        result.push.apply(result, deepQueryTopLevelSelector(element.shadowRoot.children[shc], selectorFn));
      }
    }
  }

  for (var ci = 0; ci < element.children.length; ci++) {
    if (isHTMLElement(element.children[ci])) {
      result.push.apply(result, deepQueryTopLevelSelector(element.children[ci], selectorFn));
    }
  }

  return result;
}

// === Translation attributes (translation-attributes.ts) ===

var LANG_DISPLAY_TO_CODE = {
  '中文': 'zh',
  'English': 'en',
  '日本語': 'ja',
  '한국어': 'ko',
  'Français': 'fr',
  'Deutsch': 'de',
  'Español': 'es',
  'Русский': 'ru',
};

var TARGET_LANG_MAP = {
  'zh': { dir: 'ltr', lang: 'zh' },
  'zh-TW': { dir: 'ltr', lang: 'zh-TW' },
  'ja': { dir: 'ltr', lang: 'ja' },
  'ar': { dir: 'rtl', lang: 'ar' },
  'fa': { dir: 'rtl', lang: 'fa' },
  'ur': { dir: 'rtl', lang: 'ur' },
  'en': { dir: 'ltr', lang: 'en' },
  'ko': { dir: 'ltr', lang: 'ko' },
  'fr': { dir: 'ltr', lang: 'fr' },
  'de': { dir: 'ltr', lang: 'de' },
  'es': { dir: 'ltr', lang: 'es' },
  'ru': { dir: 'ltr', lang: 'ru' },
  'pt': { dir: 'ltr', lang: 'pt' },
  'it': { dir: 'ltr', lang: 'it' },
  'nl': { dir: 'ltr', lang: 'nl' },
  'th': { dir: 'ltr', lang: 'th' },
  'vi': { dir: 'ltr', lang: 'vi' },
};

function setTranslationDirAndLang(element, targetLang) {
  var langCode = LANG_DISPLAY_TO_CODE[targetLang] || targetLang;
  var info = TARGET_LANG_MAP[langCode];
  if (!info) {
    info = { dir: 'ltr', lang: langCode };
  }
  element.setAttribute('dir', info.dir);
  if (info.lang) {
    element.setAttribute('lang', info.lang);
  }
}

// === Translation API ===

function buildTranslationMessages(text, targetLang) {
  var hasSep = text.indexOf('%%') >= 0;
  var sysContent;
  if (hasSep) {
    sysContent = 'You are a professional translator. Translate the following texts to ' + targetLang + '. The texts are separated by %%. Output the translations in the same order, separated by %%. Output ONLY the translations, no explanations, no notes, no numbering, no quotation marks.';
  } else {
    sysContent = 'You are a professional translator. Translate the following text to ' + targetLang + '. Output ONLY the translation, no explanations, no notes, no quotation marks.';
  }
  return [
    { role: 'system', content: sysContent },
    { role: 'user', content: text }
  ];
}

async function translateTextForPage(text) {
  var settings = await readAISettings();
  var targetLang = settings.translateLanguage || '中文';
  var messages = buildTranslationMessages(text, targetLang);
  var result = await callAI(settings, messages);
  return result || '';
}

// === Main translation functions (translation-modes.ts) ===

var HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

async function translateNodes(nodes, walkId, toggle, config, forceBlockTranslation, preTranslatedText) {
  var translationMode = config.mode;
  if (translationMode === 'translationOnly') {
    await translateNodeTranslationOnlyMode(nodes, walkId, config, toggle, preTranslatedText);
  } else if (translationMode === 'bilingual') {
    await translateNodesBilingualMode(nodes, walkId, config, toggle, forceBlockTranslation, preTranslatedText);
  }
}

async function translateNodesBilingualMode(nodes, walkId, config, toggle, forceBlockTranslation, preTranslatedText) {
  var transNodes = nodes.filter(function(node) { return isTransNode(node); });
  if (transNodes.length === 0) return;

  try {
    if (transNodes.every(function(node) { return translatingNodes.has(node); })) return;
    transNodes.forEach(function(node) { translatingNodes.add(node); });

    var lastNode = transNodes.at(-1);
    var targetNode = transNodes.length === 1 && isBlockTransNode(lastNode) && isHTMLElement(lastNode)
      ? await unwrapDeepestOnlyHTMLChild(lastNode)
      : lastNode;

    var existedTranslatedWrapper = findPreviousTranslatedWrapperInside(targetNode, walkId);
    if (existedTranslatedWrapper) {
      removeTranslatedWrapperWithRestore(existedTranslatedWrapper);
      if (toggle) {
        return;
      } else {
        nodes.forEach(function(node) { translatingNodes.delete(node); });
        await translateNodesBilingualMode(nodes, walkId, config, toggle);
        return;
      }
    }

    var textContent = transNodes.map(function(node) { return extractTextContent(node); }).join('').trim();
    if (!textContent || isNumericContent(textContent)) return;

    if (shouldFilterSmallParagraph(textContent, config.minCharactersPerNode)) return;

    var ownerDoc = getOwnerDocument(targetNode);
    var translatedWrapperNode = ownerDoc.createElement('span');
    translatedWrapperNode.className = NOTRANSLATE_CLASS + ' ' + CONTENT_WRAPPER_CLASS;
    translatedWrapperNode.setAttribute(TRANSLATION_MODE_ATTRIBUTE, 'bilingual');
    translatedWrapperNode.setAttribute(WALKED_ATTRIBUTE, walkId);
    setTranslationDirAndLang(translatedWrapperNode, config.targetLang);
    var spinner = createSpinnerInside(translatedWrapperNode);

    batchDOMOperation(function() {
      if (isTextNode(targetNode) || transNodes.length > 1) {
        targetNode.parentNode?.insertBefore(translatedWrapperNode, targetNode.nextSibling);
      } else {
        targetNode.appendChild(translatedWrapperNode);
      }
    });

    var realTranslatedText = await getTranslatedTextAndRemoveSpinner(nodes, textContent, spinner, translatedWrapperNode, preTranslatedText);
    var translatedText = getDisplayTranslation(textContent, realTranslatedText);

    if (!translatedText) {
      if (translatedText === '') {
        batchDOMOperation(function() { translatedWrapperNode.remove(); });
      }
      return;
    }

    await insertTranslatedNodeIntoWrapper(
      translatedWrapperNode,
      targetNode,
      translatedText,
      config.translationNodeStyle,
      forceBlockTranslation,
    );
  } finally {
    transNodes.forEach(function(node) { translatingNodes.delete(node); });
  }
}

async function translateNodeTranslationOnlyMode(nodes, walkId, config, toggle, preTranslatedText) {
  var isTransNodeAndNotTranslatedWrapper = function(node) {
    if (isHTMLElement(node) && node.classList.contains(CONTENT_WRAPPER_CLASS)) return false;
    return isTransNode(node);
  };

  var outerTransNodes = nodes.filter(function(node) { return isTransNode(node); });
  if (outerTransNodes.length === 0) return;

  var outerParentElement = outerTransNodes[0].parentElement;
  var hasExistingWrapper = outerParentElement?.querySelector('.' + CONTENT_WRAPPER_CLASS);
  if (outerParentElement && !originalContentMap.has(outerParentElement) && !hasExistingWrapper) {
    originalContentMap.set(outerParentElement, outerParentElement.innerHTML);
  }

  var transNodes = [];
  var allChildNodes = [];
  if (outerTransNodes.length === 1 && isHTMLElement(outerTransNodes[0])) {
    var unwrappedHTMLChild = await unwrapDeepestOnlyHTMLChild(outerTransNodes[0]);
    allChildNodes = Array.from(unwrappedHTMLChild.childNodes);
    transNodes = allChildNodes.filter(function(n) { return isTransNodeAndNotTranslatedWrapper(n); });
  } else {
    transNodes = outerTransNodes;
    allChildNodes = nodes;
  }

  if (transNodes.length === 0) return;

  try {
    if (nodes.every(function(node) { return translatingNodes.has(node); })) return;
    nodes.forEach(function(node) { translatingNodes.add(node); });

    var targetNode = transNodes.at(-1);
    var parentNode = targetNode.parentElement;
    if (!parentNode) {
      console.error('targetNode.parentElement is not HTMLElement', targetNode.parentElement);
      return;
    }

    var existedTranslatedWrapper = findPreviousTranslatedWrapperInside(targetNode.parentElement, walkId);
    var existedTranslatedWrapperOutside = targetNode.parentElement.closest('.' + CONTENT_WRAPPER_CLASS);

    var finalTranslatedWrapper = existedTranslatedWrapperOutside ?? existedTranslatedWrapper;
    if (finalTranslatedWrapper && isHTMLElement(finalTranslatedWrapper)) {
      removeTranslatedWrapperWithRestore(finalTranslatedWrapper);
      if (toggle) {
        return;
      } else {
        nodes.forEach(function(node) { translatingNodes.delete(node); });
        await translateNodeTranslationOnlyMode(nodes, walkId, config, toggle);
        return;
      }
    }

    var innerTextContent = transNodes.map(function(node) { return extractTextContent(node); }).join('');
    if (!innerTextContent.trim() || isNumericContent(innerTextContent)) return;

    if (shouldFilterSmallParagraph(innerTextContent, config.minCharactersPerNode)) return;

    var cleanTextContent = function(content) {
      if (!content) return content;
      var cleanedContent = content.replace(MARK_ATTRIBUTES_REGEX, '');
      cleanedContent = cleanedContent.replace(HTML_COMMENT_RE, ' ');
      return cleanedContent;
    };

    var hasExistingWrapperInParent = parentNode.querySelector('.' + CONTENT_WRAPPER_CLASS);
    if (!originalContentMap.has(parentNode) && !hasExistingWrapperInParent) {
      originalContentMap.set(parentNode, parentNode.innerHTML);
    }

    var getStringFormatFromNode = function(node) {
      if (isTextNode(node)) return node.textContent;
      return node.outerHTML;
    };

    var textContent = cleanTextContent(transNodes.map(getStringFormatFromNode).join(''));
    if (!textContent) return;

    var ownerDoc = getOwnerDocument(targetNode);
    var translatedWrapperNode = ownerDoc.createElement('span');
    translatedWrapperNode.className = NOTRANSLATE_CLASS + ' ' + CONTENT_WRAPPER_CLASS;
    translatedWrapperNode.setAttribute(TRANSLATION_MODE_ATTRIBUTE, 'translationOnly');
    translatedWrapperNode.setAttribute(WALKED_ATTRIBUTE, walkId);
    translatedWrapperNode.style.display = 'contents';
    setTranslationDirAndLang(translatedWrapperNode, config.targetLang);
    var spinner = createSpinnerInside(translatedWrapperNode);

    batchDOMOperation(function() {
      if (isTextNode(targetNode) || transNodes.length > 1) {
        targetNode.parentNode?.insertBefore(translatedWrapperNode, targetNode.nextSibling);
      } else {
        targetNode.appendChild(translatedWrapperNode);
      }
    });

    var realTranslatedText = await getTranslatedTextAndRemoveSpinner(nodes, textContent, spinner, translatedWrapperNode, preTranslatedText);
    var translatedText = realTranslatedText ? getDisplayTranslation(textContent, realTranslatedText) : realTranslatedText;

    if (!translatedText) {
      if (translatedText === '') {
        batchDOMOperation(function() { translatedWrapperNode.remove(); });
      }
      return;
    }

    translatedWrapperNode.innerHTML = translatedText;

    batchDOMOperation(function() {
      var lastChildNode = allChildNodes.at(-1);
      lastChildNode.parentNode?.insertBefore(translatedWrapperNode, lastChildNode.nextSibling);
      allChildNodes.forEach(function(childNode) { childNode.remove(); });
    });
  } finally {
    nodes.forEach(function(node) { translatingNodes.delete(node); });
  }
}

// === Collect ===

function collect(root, walkId) {
  var groups = [];
  var children = root.childNodes;

  for (var ci = 0; ci < children.length; ci++) {
    var child = children[ci];

    if (isTextNode(child)) continue;
    if (!isHTMLElement(child)) continue;
    if (isDontWalkIntoAndDontTranslateAsChildElement(child)) continue;

    if (child.hasAttribute(PARAGRAPH_ATTRIBUTE)) {
      var pending = [];
      var childNodes = child.childNodes;

      for (var cj = 0; cj < childNodes.length; cj++) {
        var cn = childNodes[cj];

        if (isTextNode(cn)) {
          if (cn.textContent?.trim()) pending.push(cn);
          continue;
        }

        if (!isHTMLElement(cn)) continue;
        if (isDontWalkIntoAndDontTranslateAsChildElement(cn)) continue;

        if (cn.hasAttribute(INLINE_ATTRIBUTE)) {
          pending.push(cn);
        } else if (cn.hasAttribute(BLOCK_ATTRIBUTE)) {
          if (pending.length > 0) {
            groups.push({ nodes: pending, forceBlock: !isForceInlineTranslation(child) });
            pending = [];
          }
          groups = groups.concat(collect(cn, walkId));
        }
      }

      if (pending.length > 0) {
        groups.push({ nodes: pending, forceBlock: !isForceInlineTranslation(child) });
      }
    } else if (child.hasAttribute(BLOCK_ATTRIBUTE)) {
      groups = groups.concat(collect(child, walkId));
    } else {
      groups = groups.concat(collect(child, walkId));
    }
  }

  return groups;
}

// === PageTranslator ===

var ptState = 'idle';
var ptProgress = { done: 0, total: 0 };

async function translateAll(targetLang, callbacks, force) {
  if (ptState === 'translating') return;
  ptState = 'translating';

  try {
    var settings = await readAISettings();
    var config = {
      mode: settings.pageTranslateBilingual ? 'bilingual' : 'translationOnly',
      targetLang: targetLang || settings.translateLanguage || '中文',
      translationNodeStyle: settings.pageTranslateBilingualStyle || 'background',
      minCharactersPerNode: 0,
    };

    if (!targetLang) {
      config.targetLang = settings.translateLanguage || '中文';
    }

    var walkId = 'htp-' + Date.now();

    walkAndLabelElement(document.body, walkId);

    var groups = collect(document.body, walkId);

    if (groups.length === 0) {
      ptState = 'translated';
      if (callbacks && callbacks.done) callbacks.done({ failed: 0, total: 0 });
      return;
    }

    var total = groups.length;
    var done = 0;
    var failed = 0;

    if (callbacks && callbacks.progress) callbacks.progress(done, total);

    var BATCH_SIZE = 50;
    var CONCURRENCY = 3;

    var batches = [];
    for (var gi = 0; gi < groups.length; gi += BATCH_SIZE) {
      batches.push(groups.slice(gi, gi + BATCH_SIZE));
    }

    async function processBatch(batch) {
      var batchTexts = [];
      var validIndices = [];

      for (var bi = 0; bi < batch.length; bi++) {
        var group = batch[bi];
        var text = group.nodes.map(function(node) { return extractTextContent(node); }).join('').trim();
        if (!text || isNumericContent(text)) {
          batchTexts.push(null);
          continue;
        }
        if (shouldFilterSmallParagraph(text, config.minCharactersPerNode)) {
          batchTexts.push(null);
          continue;
        }
        batchTexts.push(text);
        validIndices.push(bi);
      }

      if (validIndices.length > 0) {
        var combinedText = validIndices.map(function(idx) { return batchTexts[idx]; }).join('%%');
        var maxRetries = 4;
        var translatedCombined = null;
        for (var retry = 0; retry <= maxRetries; retry++) {
          try {
            translatedCombined = await translateTextForPage(combinedText);
            break;
          } catch (e) {
            if (retry < maxRetries) {
              await new Promise(function(r) { setTimeout(r, 5000); });
            }
          }
        }
        if (translatedCombined) {
          var parts = translatedCombined.split('%%');
          for (var vi = 0; vi < validIndices.length; vi++) {
            var bi_ = validIndices[vi];
            batchTexts[bi_] = (parts[vi] || '').trim();
          }
        } else {
          for (var vi = 0; vi < validIndices.length; vi++) {
            batchTexts[validIndices[vi]] = '__FAILED__';
          }
        }
      }

      for (var bi = 0; bi < batch.length; bi++) {
        var group = batch[bi];
        var preTranslatedText = batchTexts[bi];

        if (preTranslatedText === null) {
          done++;
          if (callbacks && callbacks.progress) callbacks.progress(done, total);
          continue;
        }

        if (preTranslatedText === '__FAILED__') {
          failed++;
          done++;
          if (callbacks && callbacks.progress) callbacks.progress(done, total);
          continue;
        }

        try {
          await translateNodes(group.nodes, walkId, false, config, group.forceBlock, preTranslatedText);
          flushBatchedOperations();
          done++;
          if (callbacks && callbacks.progress) callbacks.progress(done, total);
        } catch (e) {
          console.error('[PageTranslate] group error:', e);
          failed++;
          done++;
          if (callbacks && callbacks.progress) callbacks.progress(done, total);
        }
      }
    }

    for (var bi = 0; bi < batches.length; bi += CONCURRENCY) {
      var concurrentBatches = [];
      for (var ci = 0; ci < CONCURRENCY && bi + ci < batches.length; ci++) {
        concurrentBatches.push(processBatch(batches[bi + ci]));
      }
      await Promise.all(concurrentBatches);
    }

    ptState = 'translated';
    if (callbacks && callbacks.done) callbacks.done({ failed: failed, total: total });
  } catch (e) {
    ptState = 'idle';
    if (callbacks && callbacks.error) callbacks.error(e);
  }
}

function restore() {
  removeAllTranslatedWrapperNodes(document);
  flushBatchedOperations();

  originalContentMap.forEach(function(content, element) {
    if (element.isConnected) {
      element.innerHTML = content;
    }
  });
  originalContentMap.clear();

  var elements = document.querySelectorAll('[' + WALKED_ATTRIBUTE + ']');
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    el.removeAttribute(WALKED_ATTRIBUTE);
    el.removeAttribute(PARAGRAPH_ATTRIBUTE);
    el.removeAttribute(BLOCK_ATTRIBUTE);
    el.removeAttribute(INLINE_ATTRIBUTE);
  }

  ptState = 'idle';
  ptProgress = { done: 0, total: 0 };
}

function getState() {
  return ptState;
}

function getProgress() {
  return ptProgress;
}

window.PageTranslator = {
  translateAll: translateAll,
  restore: restore,
  getState: getState,
  getProgress: getProgress,
};
