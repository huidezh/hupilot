(function() {
  var port = chrome.runtime.connect({ name: 'browser-panel' });
  var running = false;
  var paused = false;

  var logArea = document.getElementById('logArea');
  var instructionInput = document.getElementById('instructionInput');
  var sendBtn = document.getElementById('sendBtn');
  var stopBtn = document.getElementById('stopBtn');
  var pauseBtn = document.getElementById('pauseBtn');
  var pauseIcon = document.getElementById('pauseIcon');
  var resumeIcon = document.getElementById('resumeIcon');
  var statusBar = document.getElementById('statusBar');
  var clearBtn = document.getElementById('clearBtn');
  var highlightBtn = document.getElementById('highlightBtn');
  var highlightsOn = false;
  highlightBtn.style.opacity = '0.4';

  function applyTheme() {
    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.toggle('dark', dark);
  }
  applyTheme();
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  }

  function addLog(text, cls) {
    var d = document.createElement('div');
    d.className = 'log-entry ' + (cls || 'log-info');
    d.innerHTML = '<span class="log-time">' + new Date().toLocaleTimeString() + '</span>' + text;
    logArea.appendChild(d);
    logArea.scrollTop = logArea.scrollHeight;
  }

  function setPauseBtnMode(mode) {
    if (mode === 'pause') {
      paused = false;
      pauseBtn.title = '暂停';
      pauseBtn.className = '';
      pauseIcon.style.display = '';
      resumeIcon.style.display = 'none';
    } else {
      paused = true;
      pauseBtn.title = '继续';
      pauseBtn.className = 'resumed';
      pauseIcon.style.display = 'none';
      resumeIcon.style.display = '';
    }
  }

  function setRunning(r) {
    running = r;
    sendBtn.style.display = r ? 'none' : 'flex';
    stopBtn.style.display = r ? 'flex' : 'none';
    pauseBtn.style.display = r ? 'flex' : 'none';
    instructionInput.disabled = r;
    statusBar.textContent = r ? '运行中...' : '就绪';
    if (!r) {
      setPauseBtnMode('pause');
      paused = false;
    }
  }

  var stateNames = {
    'task.start': '任务开始', 'task.ok': '任务完成', 'task.fail': '任务失败',
    'task.cancel': '已取消', 'task.pause': '已暂停', 'task.resume': '已恢复',
    'step.start': '步骤', 'step.ok': '步骤完成', 'step.fail': '步骤失败', 'step.cancel': '已取消',
    'act.start': '执行', 'act.ok': '完成', 'act.fail': '执行失败',
  };

  function onMessage(m) {
    if (m.type === 'event') {
      var label = stateNames[m.state] || m.state;
      var info = m.details ? ' - ' + m.details : '';
      var stepInfo = m.step ? '[' + m.step + '/' + (m.maxSteps || '?') + '] ' : '';
      var cls = 'log-info';
      if (m.state === 'act.start' || m.state === 'step.start') cls = 'log-action';
      else if (m.state.indexOf('fail') >= 0 || m.state === 'task.fail') cls = 'log-error';
      else if (m.state === 'task.ok' || m.state === 'act.ok' || m.state === 'step.ok') cls = 'log-done';
      else if (m.state === 'task.cancel') cls = 'log-error';
      else if (m.state === 'task.pause') { cls = 'log-status'; setPauseBtnMode('resume'); statusBar.textContent = '已暂停'; }
      else if (m.state === 'task.resume') { cls = 'log-status'; setPauseBtnMode('pause'); statusBar.textContent = '运行中...'; }
      addLog(stepInfo + '<span class="log-step">' + label + '</span>' + info, cls);
    } else if (m.type === 'done') {
      addLog('浏览器任务已完成', 'log-done');
      setRunning(false);
    } else if (m.type === 'error') {
      addLog('错误: ' + m.error, 'log-error');
      setRunning(false);
    } else if (m.type === 'highlightState') {
      highlightsOn = m.on;
      highlightBtn.style.opacity = highlightsOn ? '1' : '0.4';
    }
  }

  port.onMessage.addListener(onMessage);

  function reconnectPort() {
    try {
      port = chrome.runtime.connect({ name: 'browser-panel' });
      port.onMessage.addListener(onMessage);
port.onDisconnect.addListener(function() {
        addLog('与后台连接断开，正在重连...', 'log-error');
        setRunning(false);
        setTimeout(reconnectPort, 1000);
      });
      addLog('已重新连接', 'log-done');
    } catch(e) {
      addLog('重连失败，请刷新侧边栏', 'log-error');
    }
  }

  port.onDisconnect.addListener(function() {
    addLog('因超时未操作，与后台连接断开，正在重连...', 'log-error');
    setRunning(false);
    setTimeout(reconnectPort, 1000);
  });

  function startTask() {
    if (running) return;
    var instruction = instructionInput.value.trim();
    if (!instruction) { addLog('请输入指令', 'log-error'); return; }
    logArea.innerHTML = '';
    instructionInput.value = '';
    setRunning(true);
    try {
      port.postMessage({ type: 'new_task', instruction: instruction });
    } catch(e) {
      addLog('连接已断开，请刷新侧边栏重试', 'log-error');
      setRunning(false);
    }
  }

  sendBtn.addEventListener('click', startTask);
  instructionInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); startTask(); }
  });

  stopBtn.addEventListener('click', function() {
    try { port.postMessage({ type: 'stop' }); } catch(e) {}
    addLog('正在停止...', 'log-status');
  });

  pauseBtn.addEventListener('click', function() {
    if (paused) {
      try { port.postMessage({ type: 'resume' }); } catch(e) {}
      addLog('正在继续...', 'log-status');
    } else {
      try { port.postMessage({ type: 'pause' }); } catch(e) {}
      addLog('正在暂停...', 'log-status');
    }
  });

  highlightBtn.addEventListener('click', function() {
    try { port.postMessage({ type: 'toggleHighlight' }); } catch(e) {}
  });

  clearBtn.addEventListener('click', function() { logArea.innerHTML = ''; });

  addLog('浏览器操控面板已就绪', 'log-status');
})();
