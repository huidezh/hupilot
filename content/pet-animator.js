(function() {
  var spriteCache = {};
  window.PetAnimator = class PetAnimator {
    constructor(canvas, options) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.frameW = options.frameW || 300;
      this.frameH = options.frameH || 300;
      this.cols = options.cols || 10;
      this.rows = options.rows || 6;
      this.totalFrames = options.totalFrames || 60;
      this.fps = options.fps || 12;
      this.frameIndex = 0;
      this.lastTime = 0;
      this.playing = false;
      this.rafId = null;
      this.canvas.width = this.frameW;
      this.canvas.height = this.frameH;
      this._loaded = false;
      this._pendingPlay = false;
      this._singleCycle = false;
      this._afterCycle = null;
      this._spriteLoading = false;

      if (spriteCache[options.sheetUrl]) {
        this.sheet = spriteCache[options.sheetUrl];
        this._loaded = true;
      } else {
        this.sheet = new Image();
        var self = this;
        this.sheet.onload = function() {
          spriteCache[options.sheetUrl] = self.sheet;
          self._loaded = true;
          if (self._pendingPlay) self._startPlay();
        };
        this.sheet.src = options.sheetUrl;
      }
    }

    play() {
      if (this.playing) return;
      if (!this._loaded || this._spriteLoading) { this._pendingPlay = true; return; }
      this._singleCycle = false;
      this._afterCycle = null;
      this._pendingOnceCallback = null;
      this._startPlay();
    }

    playOnce(callback) {
      if (this.playing) return;
      if (!this._loaded || this._spriteLoading) {
        this._pendingPlay = true;
        this._pendingOnceCallback = callback;
        return;
      }
      this._pendingOnceCallback = null;
      this._singleCycle = true;
      this._afterCycle = callback || null;
      this.frameIndex = 0;
      this._startPlay();
    }

    setSprite(url) {
      var self = this;
      if (spriteCache[url]) {
        this.sheet = spriteCache[url];
        this.frameIndex = 0;
      } else {
        this._spriteLoading = true;
        var img = new Image();
        img.onload = function() {
          spriteCache[url] = img;
          self.sheet = img;
          self._spriteLoading = false;
          self.frameIndex = 0;
          if (self._pendingPlay) {
            if (self._pendingOnceCallback) {
              self._singleCycle = true;
              self._afterCycle = self._pendingOnceCallback;
              self._pendingOnceCallback = null;
              self.frameIndex = 0;
            }
            self._startPlay();
          }
        };
        img.src = url;
      }
    }

    _startPlay() {
      this.playing = true;
      this._pendingPlay = false;
      if (this._pendingOnceCallback) {
        this._singleCycle = true;
        this._afterCycle = this._pendingOnceCallback;
        this._pendingOnceCallback = null;
        this.frameIndex = 0;
      }
      this.lastTime = performance.now();
      var self = this;
      this.rafId = requestAnimationFrame(function(t) { self._tick(t); });
    }

    _tick(now) {
      if (!this.playing) return;
      var delta = now - this.lastTime;
      var interval = 1000 / this.fps;
      if (delta >= interval) {
        this.lastTime = now - (delta % interval);
        this._drawFrame();
        if (this._singleCycle) {
          this.frameIndex++;
          if (this.frameIndex >= this.totalFrames) {
            this.playing = false;
            if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
            if (this._afterCycle) {
              var cb = this._afterCycle;
              this._afterCycle = null;
              cb();
            }
            return;
          }
        } else {
          this.frameIndex = (this.frameIndex + 1) % this.totalFrames;
        }
      }
      var self = this;
      this.rafId = requestAnimationFrame(function(t) { self._tick(t); });
    }

    _drawFrame() {
      var col = this.frameIndex % this.cols;
      var row = Math.floor(this.frameIndex / this.cols);
      this.ctx.clearRect(0, 0, this.frameW, this.frameH);
      this.ctx.drawImage(
        this.sheet,
        col * this.frameW, row * this.frameH, this.frameW, this.frameH,
        0, 0, this.frameW, this.frameH
      );
    }

    pause() {
      this.playing = false;
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }

    resume() {
      this.play();
    }

    destroy() {
      this.pause();
      this.sheet = null;
      this.ctx = null;
      this.canvas = null;
    }
  };
})();
