(function() {
  function tryOpen() {
    var sidebar = document.getElementById('ai-chat-sidebar');
    if (sidebar && !sidebar.classList.contains('open')) {
      document.dispatchEvent(new CustomEvent('aiChatToggle'));
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryOpen);
  } else {
    tryOpen();
  }
  document.addEventListener('click', function(e) {
    if (e.target.closest('#ai-chat-close-btn')) {
      setTimeout(function() { window.close(); }, 50);
    }
  });
})();
