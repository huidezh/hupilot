(function() {
  if (window.__htmlEditor) return;

  var state = {
    isEditMode: false,
    selectedElement: null,
    hoveredElement: null,
    isDirty: false,
    undoStack: [],
    redoStack: [],
    MAX_UNDO: 20,
    bound: null,
    lastFileName: '',
    _aiApplyTarget: null,
    textEditingElement: null,
    originalText: '',
    showSelection: true,
    _dragJustEnded: false,
  };

  var ID_PREFIX = 'he-';
  var els = {};

  function isSidebarEl(el) {
    while (el) {
      if (el.id === 'ai-chat-sidebar' || el.id === 'ai-chat-selection-popup' || el.id === 'ai-chat-floating-btn' || el.id === 'ai-chat-floating-menu') return true;
      if (el.classList && el.classList.contains('menu-item')) return true;
      el = el.parentElement;
    }
    return false;
  }

  // ===== Context detection =====

  var TEXT_TAGS = ['p','h1','h2','h3','h4','h5','h6','span','a','li','td','th','label','button','input','textarea','select','option','b','i','strong','em','code','pre','blockquote','q','cite','abbr','address','del','ins','mark','small','sub','sup','time','u'];

  function getElementContext(el) {
    if (!el) return 'container';
    var tag = el.tagName.toLowerCase();
    if (tag === 'img' || tag === 'svg' || tag === 'canvas') return 'image';
    if (TEXT_TAGS.indexOf(tag) !== -1) return 'text';
    return 'container';
  }

  // ===== Panel =====

  function createPanel() {
    if (document.getElementById(ID_PREFIX + 'panel')) return;

    els.panel = document.createElement('div');
    els.panel.id = ID_PREFIX + 'panel';

    // Header
    var hdr = document.createElement('div');
    hdr.id = ID_PREFIX + 'panel-hdr';
    hdr.style.cssText = 'padding:0 8px;border-bottom:1px solid #e8e8e8';
    hdr.innerHTML =
      '<div class="he-hdr-actions" style="display:flex;justify-content:flex-end;gap:2px">' +
        '<button class="he-hdr-btn" data-action="undo" title="撤销"><svg viewBox="0 0 20 20" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><polyline points="7 5 3 9 7 13"/><path d="M3 9h10a4 4 0 0 1 0 8h-2"/></svg></button>' +
        '<button class="he-hdr-btn" data-action="redo" title="重做"><svg viewBox="0 0 20 20" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><polyline points="13 5 17 9 13 13"/><path d="M17 9H7a4 4 0 0 0 0 8h2"/></svg></button>' +
        '<button class="he-hdr-btn" data-action="toggle-selection" title="选中效果"><svg viewBox="0 0 20 20" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z"/><circle cx="10" cy="10" r="2.5"/></svg></button>' +
        '<button class="he-hdr-btn" data-action="save" title="保存 HTML 文件"><svg viewBox="0 0 20 20" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M4 3h8.5L17 7.5V16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><rect x="7" y="11" width="6" height="6" rx="1"/></svg></button>' +
        '<button class="he-hdr-btn" data-action="delete" title="删除元素"><svg viewBox="0 0 20 20" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><polyline points="4 6 16 6"/><path d="M6 6v9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6"/><path d="M8 6V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1"/></svg></button>' +
        '<button class="he-hdr-btn" data-action="collapse" title="最小化"><svg viewBox="0 0 20 20" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><line x1="3" y1="16" x2="17" y2="16"/><polyline points="5 9 10 14 15 9"/></svg></button>' +
        '<button class="he-hdr-btn he-hdr-close" data-action="close" title="退出编辑"><svg viewBox="0 0 20 20" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><line x1="4" y1="4" x2="16" y2="16"/><line x1="16" y1="4" x2="4" y2="16"/></svg></button>' +
      '</div>';

    // Body
    var body = document.createElement('div');
    body.id = ID_PREFIX + 'panel-body';
    body.innerHTML =
      '<span id="' + ID_PREFIX + 'el-tag" class="he-el-tag">选择元素</span>';

    // Navigation
    body.innerHTML +=
      '<div class="he-sec">' +
        '<div class="he-row">' +
          '<button class="he-btn" data-action="nav-up">\u2191 父级</button>' +
          '<button class="he-btn" data-action="nav-down">\u2193 子级</button>' +
        '</div>' +
      '</div>';

    // Typography (text)
    body.innerHTML +=
      '<div class="he-sec" data-he-ctx="text">' +
        '<div class="he-sec-title">\u6392\u7248</div>' +
        '<div class="he-row">' +
          '<button class="he-btn" data-action="font-smaller">A\u2212</button>' +
          '<button class="he-btn" data-action="font-larger">A+</button>' +
          '<button class="he-btn" data-action="weight-decrease">B\u2212</button>' +
          '<button class="he-btn" data-action="weight-increase">B+</button>' +
        '</div>' +
        '<div class="he-row he-row-align">' +
          '<button class="he-btn" data-action="align-left" title="左对齐">\u2261\u5DE6</button>' +
          '<button class="he-btn" data-action="align-center" title="居中">\u2261\u4E2D</button>' +
          '<button class="he-btn" data-action="align-right" title="右对齐">\u2261\u53F3</button>' +
        '</div>' +
      '</div>';

    // Color (all)
    body.innerHTML +=
      '<div class="he-sec" data-he-ctx="text,container,image">' +
        '<div class="he-sec-title">\u989C\u8272</div>' +
        '<div class="he-row he-row-color">' +
          '<span class="he-lbl">\u80CC\u666F</span>' +
          '<input type="color" id="' + ID_PREFIX + 'bg-c" class="he-cpicker" value="#ffffff">' +
          '<input type="text" id="' + ID_PREFIX + 'bg-t" class="he-chex" maxlength="7" value="#ffffff">' +
          '<button class="he-btn he-btn-s" data-action="clear-bg" title="清除背景色">\u2715</button>' +
        '</div>' +
        '<div class="he-row he-row-color">' +
          '<span class="he-lbl">\u6587\u5B57</span>' +
          '<input type="color" id="' + ID_PREFIX + 'txt-c" class="he-cpicker" value="#000000">' +
          '<input type="text" id="' + ID_PREFIX + 'txt-t" class="he-chex" maxlength="7" value="#000000">' +
          '<button class="he-btn he-btn-s" data-action="clear-text" title="清除文字色">\u2715</button>' +
        '</div>' +
        '<div class="he-swatches" id="' + ID_PREFIX + 'sw"></div>' +
      '</div>';

    // Text spacing (text)
    body.innerHTML +=
      '<div class="he-sec" data-he-ctx="text">' +
        '<div class="he-sec-title">\u6587\u672C\u95F4\u8DDD</div>' +
        '<div class="he-row he-row-s">' +
          '<span class="he-lbl">\u884C\u9AD8</span>' +
          '<button class="he-btn he-btn-s" data-action="lineheight-decrease">\u2212</button>' +
          '<span id="' + ID_PREFIX + 'lh" class="he-val"></span>' +
          '<button class="he-btn he-btn-s" data-action="lineheight-increase">+</button>' +
        '</div>' +
        '<div class="he-row he-row-s">' +
          '<span class="he-lbl">\u5B57\u8DDD</span>' +
          '<button class="he-btn he-btn-s" data-action="letterspacing-decrease">\u2212</button>' +
          '<span id="' + ID_PREFIX + 'ls" class="he-val"></span>' +
          '<button class="he-btn he-btn-s" data-action="letterspacing-increase">+</button>' +
        '</div>' +
      '</div>';

    // Layout (container, image)
    body.innerHTML +=
      '<div class="he-sec" data-he-ctx="container,image">' +
        '<div class="he-sec-title">\u5E03\u5C40</div>' +
        '<div class="he-row he-row-s">' +
          '<span class="he-lbl">\u8FB9\u8DDD</span>' +
          '<button class="he-btn he-btn-s" data-action="margin-decrease">\u2212</button>' +
          '<span id="' + ID_PREFIX + 'mg" class="he-val"></span>' +
          '<button class="he-btn he-btn-s" data-action="margin-increase">+</button>' +
        '</div>' +
        '<div class="he-row he-row-s">' +
          '<span class="he-lbl">\u5185\u8DDD</span>' +
          '<button class="he-btn he-btn-s" data-action="padding-decrease">\u2212</button>' +
          '<span id="' + ID_PREFIX + 'pd" class="he-val"></span>' +
          '<button class="he-btn he-btn-s" data-action="padding-increase">+</button>' +
        '</div>' +
        '<div class="he-row he-row-s">' +
          '<span class="he-lbl">\u5706\u89D2</span>' +
          '<button class="he-btn he-btn-s" data-action="radius-decrease">\u2212</button>' +
          '<span id="' + ID_PREFIX + 'rd" class="he-val"></span>' +
          '<button class="he-btn he-btn-s" data-action="radius-increase">+</button>' +
        '</div>' +
      '</div>';

    // Image (image)
    body.innerHTML +=
      '<div class="he-sec" data-he-ctx="image">' +
        '<div class="he-sec-title">\u56FE\u7247</div>' +
        '<div class="he-row"><button class="he-btn he-btn-w" data-action="replace-image">\u66FF\u6362\u56FE\u7247</button></div>' +
        '<div class="he-row">' +
          '<button class="he-btn he-btn-s" data-action="image-width-smaller">\u5C0F</button>' +
          '<button class="he-btn he-btn-s" data-action="image-width-larger">\u5927</button>' +
          '<button class="he-btn he-btn-s" data-action="image-maxwidth-100">100%</button>' +
        '</div>' +
        '<div class="he-row">' +
          '<button class="he-btn he-btn-s" data-action="image-fit-contain">\u5305\u542B</button>' +
          '<button class="he-btn he-btn-s" data-action="image-fit-cover">\u8986\u76D6</button>' +
        '</div>' +
        '<div class="he-row">' +
          '<button class="he-btn he-btn-s" data-action="image-radius-none">\u65E0</button>' +
          '<button class="he-btn he-btn-s" data-action="image-radius-sm">\u5C0F</button>' +
          '<button class="he-btn he-btn-s" data-action="image-radius-lg">\u5927</button>' +
          '<button class="he-btn he-btn-s" data-action="image-radius-round">\u5706</button>' +
        '</div>' +
      '</div>';

    els.panel.appendChild(hdr);
    els.panel.appendChild(body);
    els.panelHdr = hdr;
    els.panelBody = body;
    document.body.appendChild(els.panel);

    // Collapsed floating button (sibling of panel, not child — avoids overflow/border-radius clipping)
    var collBtn = document.createElement('div');
    collBtn.title = '\u8FD4\u56DE\u7F16\u8F91\u9762\u677F';
    collBtn.style.cssText =
      'position:fixed;left:20px;top:20px;display:none;width:56px;height:56px;border-radius:50%;' +
      'align-items:center;justify-content:center;cursor:pointer;z-index:2147483646;' +
      'filter:drop-shadow(0 2px 6px rgba(0,0,0,0.25));transition:transform 0.15s';
    collBtn.innerHTML = '<img src="' + chrome.runtime.getURL('icons/hupilot-2.png') + '" style="display:block;width:56px;height:56px;border-radius:50%;object-fit:cover">';
    collBtn.addEventListener('mouseenter', function() { this.style.transform = 'scale(1.08)'; });
    collBtn.addEventListener('mouseleave', function() { this.style.transform = ''; });
    collBtn.addEventListener('mousedown', function() { this.style.transform = 'scale(0.95)'; });
    collBtn.addEventListener('mouseup', function() { this.style.transform = 'scale(1.08)'; });
    collBtn.addEventListener('click', function(e) {
      if (collBtn._heDragMoved) { collBtn._heDragMoved = false; return; }
      els.panel.style.left = collBtn.style.left;
      els.panel.style.top = collBtn.style.top;
      els.panel.style.display = '';
      collBtn.style.display = 'none';
      e.stopPropagation();
    });
    document.body.appendChild(collBtn);
    makeDraggable(collBtn, collBtn);
    els.collBtn = collBtn;

    // Style the panel
    els.panel.style.cssText =
      'position:fixed;left:20px;top:20px;width:258px;background:#fff;' +
      'border:1px solid #e0e0e0;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.15);' +
      'z-index:2147483646;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'font-size:13px;color:#333;line-height:1.4;display:none;' +
      'max-height:calc(100vh - 40px);overflow:hidden;' +
      '-webkit-font-smoothing:antialiased';

    // Header styles
    hdr.style.cssText =
      'display:flex;align-items:center;justify-content:flex-end;' +
      'padding:8px 10px;border-bottom:1px solid #eee;cursor:grab;user-select:none';
    els.elTag = document.getElementById(ID_PREFIX + 'el-tag');
    els.elTag.style.cssText =
      'font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;' +
      'font-size:12px;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0';

    // Header actions
    var hdrActions = els.panel.querySelector('.he-hdr-actions');
    hdrActions.style.cssText = 'display:flex;justify-content:flex-end;gap:2px;flex-shrink:0';

    // Body styles
    body.style.cssText = 'overflow-y:auto;overflow-x:hidden;padding:8px 10px;max-height:calc(100vh - 100px)';

    // Add common CSS
    var style = document.createElement('style');
    style.textContent =
      '#' + ID_PREFIX + 'panel *{box-sizing:border-box}' +
      '#' + ID_PREFIX + 'panel .he-sec{padding:6px 0;margin-bottom:4px}' +
      '#' + ID_PREFIX + 'panel .he-sec[data-he-ctx]{display:none}' +
      '#' + ID_PREFIX + 'panel .he-sec-title{font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:5px;padding-bottom:4px;border-bottom:1px solid #f0f0f0}';
    document.head.appendChild(style);

    // Swatches
    var SWATCHES = ['#ffffff','#000000','#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#a855f7'];
    var swEl = document.getElementById(ID_PREFIX + 'sw');
    swEl.style.cssText = 'display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin-top:6px';
    SWATCHES.forEach(function(c) {
      var btn = document.createElement('button');
      btn.style.cssText = 'width:100%;aspect-ratio:1;border:1px solid #d0d0d0;border-radius:4px;cursor:pointer;padding:0;background:' + c + ';transition:transform 0.1s';
      btn.title = c;
      btn.addEventListener('mouseenter', function() { this.style.transform = 'scale(1.15)'; });
      btn.addEventListener('mouseleave', function() { this.style.transform = ''; });
      btn.addEventListener('click', function() { applyColor('backgroundColor', c); });
      swEl.appendChild(btn);
    });

    // Get color elements
    els.bgC = document.getElementById(ID_PREFIX + 'bg-c');
    els.bgT = document.getElementById(ID_PREFIX + 'bg-t');
    els.txtC = document.getElementById(ID_PREFIX + 'txt-c');
    els.txtT = document.getElementById(ID_PREFIX + 'txt-t');

    // Color events
    els.bgC.addEventListener('input', function() {
      els.bgT.value = this.value;
      applyColor('backgroundColor', this.value);
    });
    els.bgT.addEventListener('input', function() {
      var v = normalizeHex(this.value);
      if (v) { els.bgC.value = v; applyColor('backgroundColor', v); }
    });
    els.txtC.addEventListener('input', function() {
      els.txtT.value = this.value;
      applyColor('color', this.value);
    });
    els.txtT.addEventListener('input', function() {
      var v = normalizeHex(this.value);
      if (v) { els.txtC.value = v; applyColor('color', v); }
    });

    // Panel event delegation
    els.panel.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (btn) handleAction(btn.dataset.action, e);
    });

    // Drag
    makeDraggable(hdr, els.panel);

    // Restore position
    try {
      var saved = localStorage.getItem('hupilot_he_pos');
      if (saved) {
        var pos = JSON.parse(saved);
        els.panel.style.left = pos.left;
        els.panel.style.top = pos.top;
      }
    } catch(e) {}

    // Hide initially
    els.panel.style.display = 'none';
  }

  function makeDraggable(handle, panel) {
    var dragging = false, dragMoved = false, startX, startY, origLeft, origTop;
    handle.addEventListener('mousedown', function(e) {
      if (e.target.closest('button')) return;
      dragging = true;
      dragMoved = false;
      handle._heDragMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      origLeft = panel.style.left || '20px';
      origTop = panel.style.top || '20px';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      dragMoved = true;
      panel.style.left = (e.clientX - startX + parseInt(origLeft)) + 'px';
      panel.style.top = (e.clientY - startY + parseInt(origTop)) + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', function() {
      if (dragging) {
        dragging = false;
        handle._heDragMoved = dragMoved;
        try {
          localStorage.setItem('hupilot_he_pos', JSON.stringify({left: panel.style.left, top: panel.style.top}));
        } catch(e) {}
      }
    });
  }

  // ===== Overlays =====

  function createOverlays() {
    if (document.getElementById(ID_PREFIX + 'hover-overlay')) return;

    els.hoverOverlay = document.createElement('div');
    els.hoverOverlay.id = ID_PREFIX + 'hover-overlay';
    els.hoverOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483645;display:none;border:2px solid #3b82f6;background:rgba(59,130,246,0.04);border-radius:2px;transition:all 0.08s ease-out';
    document.body.appendChild(els.hoverOverlay);

    els.selectedOverlay = document.createElement('div');
    els.selectedOverlay.id = ID_PREFIX + 'selected-overlay';
    els.selectedOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483645;display:none;border:2px solid #607CD2;background:rgba(96,124,210,0.06);border-radius:2px';
    document.body.appendChild(els.selectedOverlay);

    els.resizeHandle = document.createElement('div');
    els.resizeHandle.id = ID_PREFIX + 'resize-handle';
    els.resizeHandle.style.cssText = 'position:fixed;pointer-events:auto;z-index:2147483646;display:none;cursor:nwse-resize;width:14px;height:14px;box-sizing:border-box;background:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 14 14\'%3E%3Cpolyline points=\'3,11 11,11 11,3\' fill=\'none\' stroke=\'%23607CD2\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E") no-repeat';
    els.resizeHandle.addEventListener('mousedown', onResizeMouseDown);
    document.body.appendChild(els.resizeHandle);

    els.dragHandle = document.createElement('div');
    els.dragHandle.id = ID_PREFIX + 'drag-handle';
    els.dragHandle.style.cssText = 'position:fixed;pointer-events:auto;z-index:2147483646;display:none;cursor:move;width:14px;height:14px;box-sizing:border-box;background:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 14 14\'%3E%3Ccircle cx=\'4\' cy=\'4\' r=\'1.5\' fill=\'%23607CD2\'/%3E%3Ccircle cx=\'10\' cy=\'4\' r=\'1.5\' fill=\'%23607CD2\'/%3E%3Ccircle cx=\'4\' cy=\'10\' r=\'1.5\' fill=\'%23607CD2\'/%3E%3Ccircle cx=\'10\' cy=\'10\' r=\'1.5\' fill=\'%23607CD2\'/%3E%3C/svg%3E") no-repeat';
    els.dragHandle.addEventListener('mousedown', onDragHandleMouseDown);
    document.body.appendChild(els.dragHandle);
  }

  function updateOverlay(overlay, el) {
    var rect = el.getBoundingClientRect();
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    if (els.dragHandle && overlay === els.selectedOverlay) {
      updateDragHandle(el);
    }
  }

  function updateResizeHandle(el) {
    if (!els.resizeHandle) return;
    var rect = el.getBoundingClientRect();
    els.resizeHandle.style.left = (rect.left + rect.width - 7) + 'px';
    els.resizeHandle.style.top = (rect.top + rect.height - 7) + 'px';
  }

  function updateDragHandle(el) {
    if (!els.dragHandle) return;
    var rect = el.getBoundingClientRect();
    els.dragHandle.style.left = (rect.left - 7) + 'px';
    els.dragHandle.style.top = (rect.top - 7) + 'px';
  }

  function onDragHandleMouseDown(e) {
    if (!state.selectedElement) return;
    e.stopPropagation();
    e.preventDefault();
    finalizeTextEdit();
    captureSnapshot();
    var el = state.selectedElement;
    var cs = window.getComputedStyle(el);
    if (cs.position === 'static') el.style.position = 'relative';

    var startX = e.clientX, startY = e.clientY;
    var origLeft = parseFloat(el.style.left) || 0;
    var origTop = parseFloat(el.style.top) || 0;

    function onMove(e2) {
      el.style.left = (origLeft + e2.clientX - startX) + 'px';
      el.style.top = (origTop + e2.clientY - startY) + 'px';
      state.isDirty = true;
      if (els.selectedOverlay) updateOverlay(els.selectedOverlay, el);
      if (els.resizeHandle) updateResizeHandle(el);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function onResizeMouseDown(e) {
    if (!state.selectedElement) return;
    e.stopPropagation();
    e.preventDefault();
    finalizeTextEdit();
    captureSnapshot();
    var el = state.selectedElement;
    var startX = e.clientX;
    var startY = e.clientY;
    var startW = el.getBoundingClientRect().width;
    var startH = el.getBoundingClientRect().height;
    var cs = window.getComputedStyle(el);
    // Ensure width/height can be set via style
    if (cs.position === 'static') el.style.position = 'relative';

    function onMove(e2) {
      var dw = e2.clientX - startX;
      var dh = e2.clientY - startY;
      el.style.width = Math.max(20, startW + dw) + 'px';
      el.style.height = Math.max(20, startH + dh) + 'px';
      state.isDirty = true;
      if (els.selectedOverlay) updateOverlay(els.selectedOverlay, el);
      updateResizeHandle(el);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      state._dragJustEnded = true;
      setTimeout(function() { state._dragJustEnded = false; }, 200);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ===== Action handler =====

  function handleAction(action, event) {
    switch (action) {
      case 'save':
        saveAsHtml();
        break;
      case 'delete':
        if (state.selectedElement) {
          captureSnapshot();
          state.selectedElement.parentNode.removeChild(state.selectedElement);
          state.selectedElement = null;
          if (els.selectedOverlay) els.selectedOverlay.style.display = 'none';
          if (els.resizeHandle) els.resizeHandle.style.display = 'none';
          if (els.dragHandle) els.dragHandle.style.display = 'none';
          document.getElementById(ID_PREFIX + 'el-tag').textContent = '选择元素';
        }
        break;
      case 'close':
        exitEditMode();
        document.dispatchEvent(new CustomEvent('htmlEditorExited'));
        break;
      case 'collapse':
        if (els.collBtn) {
          els.collBtn.style.left = els.panel.style.left || '20px';
          els.collBtn.style.top = els.panel.style.top || '20px';
          els.collBtn.style.display = 'flex';
          els.panel.style.display = 'none';
        }
        break;
      case 'toggle-selection':
        state.showSelection = !state.showSelection;
        var btn = els.panel && els.panel.querySelector('[data-action="toggle-selection"]');
        if (btn) {
          btn.style.opacity = state.showSelection ? '1' : '0.4';
        }
        if (!state.showSelection) {
          if (els.hoverOverlay) els.hoverOverlay.style.display = 'none';
          if (els.selectedOverlay) els.selectedOverlay.style.display = 'none';
        } else if (state.selectedElement) {
          if (els.selectedOverlay) {
            updateOverlay(els.selectedOverlay, state.selectedElement);
            els.selectedOverlay.style.display = '';
          }
        }
        break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'nav-up': navigateUp(); break;
      case 'nav-down': navigateDown(); break;
      case 'font-smaller': applyStyleDelta('fontSize', -2, 'px'); break;
      case 'font-larger': applyStyleDelta('fontSize', 2, 'px'); break;
      case 'weight-decrease': applyStyleDelta('fontWeight', -100, ''); break;
      case 'weight-increase': applyStyleDelta('fontWeight', 100, ''); break;
      case 'align-left': applyStyleValue('textAlign', 'left'); break;
      case 'align-center': applyStyleValue('textAlign', 'center'); break;
      case 'align-right': applyStyleValue('textAlign', 'right'); break;
      case 'lineheight-decrease': applyStyleDelta('lineHeight', -0.1, ''); break;
      case 'lineheight-increase': applyStyleDelta('lineHeight', 0.1, ''); break;
      case 'letterspacing-decrease': applyStyleDelta('letterSpacing', -0.5, 'px'); break;
      case 'letterspacing-increase': applyStyleDelta('letterSpacing', 0.5, 'px'); break;
      case 'margin-decrease': applyStyleDelta('margin', -4, 'px'); break;
      case 'margin-increase': applyStyleDelta('margin', 4, 'px'); break;
      case 'padding-decrease': applyStyleDelta('padding', -4, 'px'); break;
      case 'padding-increase': applyStyleDelta('padding', 4, 'px'); break;
      case 'radius-decrease': applyStyleDelta('borderRadius', -2, 'px'); break;
      case 'radius-increase': applyStyleDelta('borderRadius', 2, 'px'); break;
      case 'clear-bg': applyColor('backgroundColor', ''); break;
      case 'clear-text': applyColor('color', ''); break;
      case 'replace-image': handleReplaceImage(); break;
      case 'image-width-smaller': applyStyleDelta('width', -20, 'px'); break;
      case 'image-width-larger': applyStyleDelta('width', 20, 'px'); break;
      case 'image-maxwidth-100': applyStyleValue('maxWidth', '100%'); break;
      case 'image-fit-contain': applyStyleValue('objectFit', 'contain'); break;
      case 'image-fit-cover': applyStyleValue('objectFit', 'cover'); break;
      case 'image-radius-none': applyStyleValue('borderRadius', '0'); break;
      case 'image-radius-sm': applyStyleValue('borderRadius', '4px'); break;
      case 'image-radius-lg': applyStyleValue('borderRadius', '12px'); break;
      case 'image-radius-round': applyStyleValue('borderRadius', '50%'); break;
    }
  }

  // ===== Style helpers =====

  function applyStyleDelta(prop, delta, unit) {
    var el = state.selectedElement;
    if (!el) return;
    captureSnapshot();
    var computed = window.getComputedStyle(el);
    var current = parseFloat(computed[prop]) || 0;
    var newVal = Math.max(0, current + delta);
    el.style[prop] = newVal + unit;
    state.isDirty = true;
    refreshValueDisplay(el);
  }

  function applyStyleValue(prop, value) {
    var el = state.selectedElement;
    if (!el) return;
    captureSnapshot();
    el.style[prop] = value;
    state.isDirty = true;
    refreshValueDisplay(el);
  }

  function refreshValueDisplay(el) {
    if (!el) return;
    var c = window.getComputedStyle(el);
    setText(ID_PREFIX + 'lh', c.lineHeight);
    setText(ID_PREFIX + 'ls', c.letterSpacing);
    var mg = c.margin;
    if (!mg) mg = c.marginTop + ' ' + c.marginRight + ' ' + c.marginBottom + ' ' + c.marginLeft;
    setText(ID_PREFIX + 'mg', mg);
    var pd = c.padding;
    if (!pd) pd = c.paddingTop + ' ' + c.paddingRight + ' ' + c.paddingBottom + ' ' + c.paddingLeft;
    setText(ID_PREFIX + 'pd', pd);
    setText(ID_PREFIX + 'rd', c.borderRadius);
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val || '';
  }

  // ===== Navigation =====

  function navigateUp() {
    var el = state.selectedElement;
    if (!el || !el.parentElement) return;
    var p = el.parentElement;
    if (p !== document.body && p !== document.documentElement) {
      selectElement(p);
    }
  }

  function navigateDown() {
    var el = state.selectedElement;
    if (!el || !el.parentElement) return;
    var children = Array.from(el.parentElement.children);
    var idx = children.indexOf(el);
    if (idx < children.length - 1) {
      selectElement(children[idx + 1]);
    } else if (el.firstElementChild) {
      selectElement(el.firstElementChild);
    }
  }

  // ===== Element selection =====

  function selectElement(el) {
    state.selectedElement = el;
    if (els.selectedOverlay) {
      updateOverlay(els.selectedOverlay, el);
      els.selectedOverlay.style.display = state.showSelection ? '' : 'none';
    }
    if (els.resizeHandle) {
      updateResizeHandle(el);
      els.resizeHandle.style.display = state.showSelection ? '' : 'none';
    }
    if (els.dragHandle) {
      updateDragHandle(el);
      els.dragHandle.style.display = state.showSelection ? '' : 'none';
    }
    if (els.panel) updatePanel(el);
  }

  function updatePanel(el) {
    // Context sections
    var ctx = getElementContext(el);
    els.panel.querySelectorAll('[data-he-ctx]').forEach(function(s) {
      var ctxList = (s.getAttribute('data-he-ctx') || '').split(',');
      s.style.display = ctxList.indexOf(ctx) !== -1 ? 'block' : 'none';
    });

    // Title
    var desc = el.tagName.toLowerCase();
    if (el.id) desc += '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      var cls = el.className.trim().split(/\s+/).slice(0, 2);
      if (cls.length) desc += '.' + cls.join('.');
    }
    els.elTag.textContent = desc;

    // Colors
    var c = window.getComputedStyle(el);
    var bgH = rgbToHex(c.backgroundColor) || '#ffffff';
    var txH = rgbToHex(c.color) || '#000000';
    if (els.bgC) { els.bgC.value = bgH; els.bgT.value = bgH; }
    if (els.txtC) { els.txtC.value = txH; els.txtT.value = txH; }

    // Values
    refreshValueDisplay(el);
  }

  // ===== Image replacement =====

  function handleReplaceImage() {
    var el = state.selectedElement;
    if (!el || !(el instanceof HTMLImageElement)) return;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function() {
      var file = input.files[0];
      if (!file) { input.remove(); return; }
      var reader = new FileReader();
      reader.onload = function() {
        captureSnapshot();
        el.src = reader.result;
        state.isDirty = true;
        input.remove();
      };
      reader.readAsDataURL(file);
    }, {once: true});
    input.click();
  }

  // ===== Color =====

  function applyColor(prop, value) {
    var el = state.selectedElement;
    if (!el) return;
    captureSnapshot();
    el.style[prop] = value || '';
    state.isDirty = true;
    var c = window.getComputedStyle(el);
    if (prop === 'backgroundColor') {
      var h = rgbToHex(c.backgroundColor) || '#ffffff';
      if (els.bgC) { els.bgC.value = h; els.bgT.value = h; }
    } else if (prop === 'color') {
      var h2 = rgbToHex(c.color) || '#000000';
      if (els.txtC) { els.txtC.value = h2; els.txtT.value = h2; }
    }
  }

  // ===== Event binding =====

  function bindEvents() {
    unbindEvents();
    var doc = document;

    var handleMouseMove = function(e) {
      if (!state.isEditMode) return;
      if (state.selectedElement) { els.hoverOverlay.style.display = 'none'; return; }
      if (isSidebarEl(e.target) || (els.panel && els.panel.contains(e.target)) || (els.collBtn && (e.target === els.collBtn || els.collBtn.contains(e.target)))) { els.hoverOverlay.style.display = 'none'; return; }
      var el = e.target;
      if (!isValidElement(el)) { els.hoverOverlay.style.display = 'none'; return; }
      state.hoveredElement = el;
      updateOverlay(els.hoverOverlay, el);
      els.hoverOverlay.style.display = state.showSelection ? '' : 'none';
    };

    var handleClick = function(e) {
      if (!state.isEditMode) return;
      if (state._dragJustEnded) { e.stopPropagation(); return; }
      if (isSidebarEl(e.target) || (els.panel && els.panel.contains(e.target)) || (els.collBtn && (e.target === els.collBtn || els.collBtn.contains(e.target))) || (els.dragHandle && (e.target === els.dragHandle || els.dragHandle.contains(e.target)))) return;
      if (!els.panel || els.panel.style.display === 'none') return;
      var el = e.target;
      if (!isValidElement(el)) { finalizeTextEdit(); hideSelection(); return; }
      if (el === state.textEditingElement) { selectElement(el); return; }
      finalizeTextEdit();
      var tag = el.tagName.toLowerCase();
      if (['a','button','input','textarea','select','details','summary'].indexOf(tag) === -1) {
        e.preventDefault();
      }
      selectElement(el);
      if (isTextEditable(el)) startTextEditing(el);
    };

    var handleDragStart = function(e) {
      if (!state.isEditMode || !state.selectedElement) return;
      if (isSidebarEl(e.target) || (els.panel && els.panel.contains(e.target)) || (els.resizeHandle && (e.target === els.resizeHandle || els.resizeHandle.contains(e.target))) || (els.dragHandle && (e.target === els.dragHandle || els.dragHandle.contains(e.target)))) return;
      if (e.target !== state.selectedElement && !state.selectedElement.contains(e.target)) return;

      var el = state.selectedElement;
      var cs = window.getComputedStyle(el);
      if (cs.position === 'static') el.style.position = 'relative';

      var startX = e.clientX, startY = e.clientY;
      var origLeft = parseFloat(el.style.left) || 0;
      var origTop = parseFloat(el.style.top) || 0;
      var moved = false;

      function onMove(e2) {
        var dx = e2.clientX - startX;
        var dy = e2.clientY - startY;
        if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
          moved = true;
          state._dragJustEnded = true;
          finalizeTextEdit();
          captureSnapshot();
          origLeft = parseFloat(el.style.left) || 0;
          origTop = parseFloat(el.style.top) || 0;
        }
        if (moved) {
          el.style.left = (origLeft + dx) + 'px';
          el.style.top = (origTop + dy) + 'px';
          state.isDirty = true;
          if (els.selectedOverlay) updateOverlay(els.selectedOverlay, el);
          if (els.resizeHandle) updateResizeHandle(el);
        }
      }

      function onUp() {
        if (moved) { state._dragJustEnded = true; setTimeout(function() { state._dragJustEnded = false; }, 200); }
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    var handleKeyDown = function(e) {
      if (!state.isEditMode) return;
      if (e.key === 'Escape') {
        finalizeTextEdit();
        if (els.panel && els.panel.style.display !== 'none' && els.collBtn) {
          els.collBtn.style.left = els.panel.style.left || '20px';
          els.collBtn.style.top = els.panel.style.top || '20px';
          els.collBtn.style.display = 'flex';
          els.panel.style.display = 'none';
        }
        e.stopPropagation();
      }
    };

    doc.addEventListener('mousemove', handleMouseMove, true);
    doc.addEventListener('click', handleClick, true);
    doc.addEventListener('mousedown', handleDragStart);
    doc.addEventListener('keydown', handleKeyDown, true);

    state.bound = {
      handleMouseMove: handleMouseMove,
      handleClick: handleClick,
      handleDragStart: handleDragStart,
      handleKeyDown: handleKeyDown,
    };
  }

  function unbindEvents() {
    if (!state.bound) return;
    var doc = document;
    doc.removeEventListener('mousemove', state.bound.handleMouseMove, true);
    doc.removeEventListener('click', state.bound.handleClick, true);
    doc.removeEventListener('mousedown', state.bound.handleDragStart);
    doc.removeEventListener('keydown', state.bound.handleKeyDown, true);
    state.bound = null;
  }

  function isValidElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    var tag = el.tagName.toLowerCase();
    var skip = ['html','head','body','meta','link','script','style','title','br','hr','noscript'];
    if (skip.indexOf(tag) !== -1) return false;
    if (els.panel && (el === els.panel || els.panel.contains(el))) return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function hideSelection() {
    if (els.selectedOverlay) els.selectedOverlay.style.display = 'none';
    if (els.resizeHandle) els.resizeHandle.style.display = 'none';
    if (els.dragHandle) els.dragHandle.style.display = 'none';
    state.selectedElement = null;
    if (els.elTag) els.elTag.textContent = '\u9009\u62E9\u5143\u7D20';
  }

  // ===== Text editing =====

  function isTextEditable(el) {
    if (!el) return false;
    var tag = el.tagName.toLowerCase();
    if (['img','svg','canvas','input','textarea','select','button','br','hr','iframe','video','audio'].indexOf(tag) !== -1) return false;
    return (el.textContent || '').trim().length > 0;
  }

  function startTextEditing(el) {
    finalizeTextEdit();
    state.textEditingElement = el;
    state.originalText = el.textContent || '';
    el.setAttribute('contenteditable', 'true');
    el.style.outline = 'none';
    el.focus();
    var sel = window.getSelection();
    if (sel) {
      var range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function finalizeTextEdit() {
    var el = state.textEditingElement;
    if (!el) return;
    var newText = el.textContent || '';
    el.removeAttribute('contenteditable');
    state.textEditingElement = null;
    if (newText !== state.originalText) {
      captureSnapshot();
      state.isDirty = true;
    }
    state.originalText = '';
  }

  // ===== Snapshot & undo/redo =====

  function captureSnapshot() {
    state.undoStack.push({
      head: document.head.innerHTML,
      body: document.body.innerHTML,
    });
    if (state.undoStack.length > state.MAX_UNDO) state.undoStack.shift();
    state.redoStack = [];
  }

  function applySnapshot(prev, pushToRedo) {
    if (pushToRedo) {
      state.redoStack.push({
        head: document.head.innerHTML,
        body: document.body.innerHTML,
      });
      if (state.redoStack.length > state.MAX_UNDO) state.redoStack.shift();
    }
    var preserved = [];
    var preserveIds = ['ai-chat-sidebar', 'ai-chat-floating-btn', 'ai-chat-floating-menu',
      'ai-chat-selection-popup', ID_PREFIX + 'panel', ID_PREFIX + 'hover-overlay', ID_PREFIX + 'selected-overlay', ID_PREFIX + 'resize-handle', ID_PREFIX + 'drag-handle'];
    preserveIds.forEach(function(id) {
      var el = document.getElementById(id);
      if (el && el.parentNode) { preserved.push(el); el.remove(); }
    });
    document.head.innerHTML = prev.head;
    var temp = document.createElement('div');
    temp.innerHTML = prev.body;
    preserveIds.forEach(function(id) {
      var el = temp.querySelector('#' + id);
      if (el) el.remove();
    });
    document.body.innerHTML = '';
    while (temp.firstChild) document.body.appendChild(temp.firstChild);
    preserved.forEach(function(el) { document.body.appendChild(el); });
  }

  function undo() {
    finalizeTextEdit();
    if (state.undoStack.length <= 1) return;
    state.undoStack.pop();
    var prev = state.undoStack[state.undoStack.length - 1];
    applySnapshot(prev, true);
    state.isDirty = state.undoStack.length > 1;
    if (state.isEditMode) {
      ensureUI();
      if (state.selectedElement) updatePanel(state.selectedElement);
    }
  }

  function redo() {
    finalizeTextEdit();
    if (state.redoStack.length === 0) return;
    var next = state.redoStack.pop();
    applySnapshot(next, false);
    state.undoStack.push({
      head: document.head.innerHTML,
      body: document.body.innerHTML,
    });
    state.isDirty = true;
    if (state.isEditMode) {
      ensureUI();
      if (state.selectedElement) updatePanel(state.selectedElement);
    }
  }

  function ensureUI() {
    createOverlays();
    createPanel();
    bindEvents();
  }

  // ===== AI =====

  function applyAIChanges(data) {
    if (!data) return;
    var target = state.selectedElement || state._aiApplyTarget || document.body;
    captureSnapshot();
    if (data.style) {
      Object.keys(data.style).forEach(function(prop) {
        target.style[prop] = data.style[prop];
      });
    }
    if (data.html !== undefined) target.innerHTML = data.html;
    if (data.text !== undefined) target.textContent = data.text;
    if (data.attr) {
      Object.keys(data.attr).forEach(function(key) {
        target.setAttribute(key, data.attr[key]);
      });
    }
    state.isDirty = true;
  }

  function getSelectedInfo() {
    var el = state.selectedElement;
    if (!el) return null;
    state._aiApplyTarget = el;
    var rect = el.getBoundingClientRect();
    var computed = window.getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      className: (el.className && typeof el.className === 'string') ? el.className : '',
      innerText: el.innerText ? el.innerText.substring(0, 200) : '',
      outerHTML: el.outerHTML ? el.outerHTML.substring(0, 2000) : '',
      rect: { width: Math.round(rect.width), height: Math.round(rect.height) },
      style: { backgroundColor: computed.backgroundColor, color: computed.color, fontSize: computed.fontSize, fontFamily: computed.fontFamily },
    };
  }

  function getFullHtml() {
    var html = document.documentElement.outerHTML;
    if (!/^<!DOCTYPE/i.test(html)) html = '<!DOCTYPE html>\n' + html;
    return html;
  }

  function saveAsHtml() {
    var clone = document.documentElement.cloneNode(true);
    var selectors = [
      '#ai-chat-sidebar', '#ai-chat-floating-btn', '#ai-chat-floating-menu',
      '#ai-chat-selection-popup',
      '#' + ID_PREFIX + 'panel', '#' + ID_PREFIX + 'hover-overlay', '#' + ID_PREFIX + 'selected-overlay', '#' + ID_PREFIX + 'resize-handle', '#' + ID_PREFIX + 'drag-handle'
    ];
    selectors.forEach(function(sel) {
      var el = clone.querySelector(sel);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    var html = clone.outerHTML;
    if (!/^<!DOCTYPE/i.test(html)) html = '<!DOCTYPE html>\n' + html;
    var pathName = window.location.pathname.split('/').pop() || 'untitled';
    var baseName = pathName.replace(/\.html?$/i, '') || 'untitled';
    var fileName = baseName + '-edited.html';
    state.lastFileName = fileName;
    state.isDirty = false;
    try {
      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.cssText = 'position:absolute;left:-9999px;top:-9999px;display:block;visibility:visible';
      document.documentElement.appendChild(a);
      a.click();
      document.documentElement.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
      return Promise.resolve(fileName);
    } catch(e) {
      return Promise.reject(e);
    }
  }

  function resetToOriginal() {
    if (state.isDirty && !confirm('\u786E\u5B9A\u653E\u5F03\u6240\u6709\u4FEE\u6539\uFF0C\u91CD\u65B0\u52A0\u8F7D\u539F\u59CB\u6587\u4EF6?')) return;
    state.isDirty = false;
    location.reload();
  }

  // ===== Lifecycle =====

  function enterEditMode() {
    if (state.isEditMode) return;
    state.isEditMode = true;
    state.isDirty = false;
    state.undoStack = [];
    captureSnapshot();
    createOverlays();
    createPanel();
    els.panel.style.display = '';
    bindEvents();
    document.dispatchEvent(new CustomEvent('htmlEditorEntered'));
  }

  function exitEditMode() {
    if (!state.isEditMode) return;
    finalizeTextEdit();
    state.isEditMode = false;
    unbindEvents();
    if (els.panel) els.panel.style.display = 'none';
    if (els.collBtn) els.collBtn.style.display = 'none';
    if (els.hoverOverlay) els.hoverOverlay.style.display = 'none';
    if (els.selectedOverlay) els.selectedOverlay.style.display = 'none';
    if (els.resizeHandle) els.resizeHandle.style.display = 'none';
    if (els.dragHandle) els.dragHandle.style.display = 'none';
    state.selectedElement = null;
    state._aiApplyTarget = null;
  }

  // ===== Utilities =====

  function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return null;
    var match = rgb.match(/rgba?\(([^)]+)\)/);
    if (!match) {
      if (rgb.charAt(0) === '#') return rgb.length === 4 ? expandShortHex(rgb) : rgb.toLowerCase();
      return null;
    }
    var parts = match[1].split(',').map(function(s) { return parseInt(s.trim(), 10); });
    if (parts.length < 3 || parts.some(function(n) { return isNaN(n); })) return null;
    return '#' + [parts[0],parts[1],parts[2]].map(function(n) { return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0'); }).join('');
  }

  function expandShortHex(hex) {
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }

  function normalizeHex(val) {
    if (!val) return null;
    val = val.trim();
    if (val.charAt(0) !== '#') val = '#' + val;
    if (/^#[0-9a-fA-F]{3}$/.test(val)) return expandShortHex(val.toLowerCase());
    if (/^#[0-9a-fA-F]{6}$/.test(val)) return val.toLowerCase();
    return null;
  }

  // ===== Export =====

  window.__htmlEditor = {
    enterEditMode: enterEditMode,
    exitEditMode: exitEditMode,
    saveAsHtml: saveAsHtml,
    resetToOriginal: resetToOriginal,
    undo: undo,
    redo: redo,
    applyAIChanges: applyAIChanges,
    getSelectedInfo: getSelectedInfo,
    getFullHtml: getFullHtml,
    captureSnapshot: captureSnapshot,
    finalizeTextEdit: finalizeTextEdit,
    isEditMode: function() { return state.isEditMode; },
    isDirty: function() { return state.isDirty; },
    setDirty: function(v) { state.isDirty = v; },
  };

  document.dispatchEvent(new CustomEvent('htmlEditorReady'));
})();
