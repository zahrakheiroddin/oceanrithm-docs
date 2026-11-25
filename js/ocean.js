/* =========================================================
   OceanRithm motion layer
   - WebGL manta with flapping wings (intro + home hero)
   - Intro on the first visit of a session
   - Manta swim + 3D entrance on every page change
   - Tilt cards, scroll reveal
   No external libraries, no network requests.
   ========================================================= */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var finePointer = !!(window.matchMedia && window.matchMedia("(pointer: fine)").matches);

  /* ---------------- asset paths (work on any sub path) ---------------- */
  function assetUrl(name) {
    var logo = document.querySelector(".md-header__button.md-logo img");
    if (logo && logo.src) return logo.src.replace(/logo\.png(\?.*)?$/, name);
    return "/images/" + name;
  }
  function isGerman() {
    return /\/de\//.test(window.location.pathname);
  }

  /* ---------------- tiny matrix helpers (column major) ---------------- */
  var M = {
    persp: function (fovy, a, n, f) {
      var t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f);
      return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0];
    },
    mul: function (a, b) {
      var o = new Array(16);
      for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
        var s = 0;
        for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
        o[i * 4 + j] = s;
      }
      return o;
    },
    tr: function (x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; },
    rx: function (a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },
    ry: function (a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
    rz: function (a) { var c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
    sc: function (k) { return [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1]; }
  };
  function chain() {
    var m = arguments[0];
    for (var i = 1; i < arguments.length; i++) m = M.mul(m, arguments[i]);
    return m;
  }

  /* ---------------- WebGL manta ---------------- */
  var VS = [
    "attribute vec2 aUV;",
    "uniform mat4 uMVP;",
    "uniform float uT, uAmp, uFold, uSpeed;",
    "varying vec2 vUV; varying float vShade; varying float vW;",
    "void main(){",
    "  vec2 p = aUV * 360.0;",
    "  vec2 ax = normalize(vec2(160.0, -80.0));",      // head (lower left) to tail
    "  vec2 q = p - vec2(168.0, 172.0);",
    "  float s = dot(q, ax) / 180.0;",                  // along the body
    "  float d = (q.x * ax.y - q.y * ax.x) / 180.0;",   // across: the wings
    "  float ad = abs(d);",
    "  float wave = sin(uT * uSpeed - s * 1.9 - ad * 1.3);",
    "  float z = uAmp * wave * pow(ad, 1.5) + uFold * 1.25 * pow(ad, 1.15);",
    "  float slope = 1.5 * uAmp * wave * pow(ad, 0.5) + uFold * 1.4;",
    "  vShade = clamp(1.02 - 0.32 * slope, 0.62, 1.22);",
    "  vUV = aUV;",
    "  gl_Position = uMVP * vec4(aUV.x * 2.0 - 1.0, 1.0 - aUV.y * 2.0, z, 1.0);",
    "  vW = gl_Position.w;",
    "}"
  ].join("\n");

  var FS = [
    "precision mediump float;",
    "uniform sampler2D uTex;",
    "uniform vec3 uFog; uniform float uFogNear, uFogFar, uAlpha;",
    "varying vec2 vUV; varying float vShade; varying float vW;",
    "void main(){",
    "  vec4 c = texture2D(uTex, vUV);",
    "  if (c.a < 0.01) discard;",
    "  vec3 col = c.rgb * vShade;",
    "  float f = clamp((vW - uFogNear) / (uFogFar - uFogNear), 0.0, 0.88);",
    "  col = mix(col, uFog * c.a, f);",
    "  gl_FragColor = vec4(col, c.a) * uAlpha;",
    "}"
  ].join("\n");

  // target: a <canvas> (own context) or an existing WebGL context (shared)
  function Manta(target, img) {
    var own = !!(target && target.getContext);
    var gl = own ? target.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true }) : target;
    if (!gl) throw new Error("no webgl");
    this.gl = gl;
    this.canvas = own ? target : null;
    this.own = own;

    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error("link");
    gl.useProgram(pr);
    this.pr = pr;

    var N = 44, uv = [], idx = [];
    for (var y = 0; y <= N; y++) for (var x = 0; x <= N; x++) uv.push(x / N, y / N);
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      var a = y * (N + 1) + x, b = a + 1, c = a + N + 1, d2 = c + 1;
      idx.push(a, c, b, b, c, d2);
    }
    this.count = idx.length;
    var vb = gl.createBuffer();
    this.vb = vb;
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
    var ib = gl.createBuffer();
    this.ib = ib;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, "aUV");
    this.loc = loc;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var tex = gl.createTexture();
    this.tex = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disableVertexAttribArray(loc); // draw() enables it; keeps shared contexts clean

    var names = ["uMVP", "uT", "uAmp", "uFold", "uSpeed", "uFog", "uFogNear", "uFogFar", "uAlpha"];
    this.u = {};
    for (var i = 0; i < names.length; i++) this.u[names[i]] = gl.getUniformLocation(pr, names[i]);
  }

  Manta.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.5 : 2);
    var w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    var h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
    return w / h;
  };

  Manta.prototype.draw = function (o) {
    var gl = this.gl, u = this.u;
    gl.useProgram(this.pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vb);
    gl.enableVertexAttribArray(this.loc);
    gl.vertexAttribPointer(this.loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ib);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (!o.noClear) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.uniformMatrix4fv(u.uMVP, false, new Float32Array(o.mvp));
    gl.uniform1f(u.uT, o.t);
    gl.uniform1f(u.uAmp, o.amp);
    gl.uniform1f(u.uFold, o.fold || 0);
    gl.uniform1f(u.uSpeed, o.speed || 2.6);
    gl.uniform3fv(u.uFog, o.fog || [0.02, 0.1, 0.17]);
    gl.uniform1f(u.uFogNear, o.fogNear == null ? 6 : o.fogNear);
    gl.uniform1f(u.uFogFar, o.fogFar == null ? 40 : o.fogFar);
    gl.uniform1f(u.uAlpha, o.alpha == null ? 1 : o.alpha);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    gl.disableVertexAttribArray(this.loc);
  };

  Manta.prototype.destroy = function () {
    if (!this.own) return;
    var ext = this.gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  };

  var mantaImg = null;
  function loadManta(cb) {
    if (mantaImg && mantaImg.complete && mantaImg.naturalWidth) return cb(mantaImg);
    mantaImg = new Image();
    mantaImg.onload = function () { cb(mantaImg); };
    mantaImg.onerror = function () { cb(null); };
    mantaImg.src = assetUrl("manta.png");
  }

  function easeInOut(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function bez(p0, p1, p2, p3, t) {
    var a = 1 - t;
    return a * a * a * p0 + 3 * a * a * t * p1 + 3 * a * t * t * p2 + t * t * t * p3;
  }

  /* ---------------- Intro ---------------- */
  function playIntro(done) {
    var de = isGerman();
    var el = document.createElement("div");
    el.className = "or-intro";
    var bubbles = "";
    for (var i = 0; i < 22; i++) {
      bubbles += '<span style="--x:' + (Math.random() * 100).toFixed(1) + "%;--s:" + (4 + Math.random() * 10).toFixed(1) +
        "px;--d:" + (3 + Math.random() * 4).toFixed(2) + "s;--w:" + (-Math.random() * 4).toFixed(2) + 's"></span>';
    }
    el.innerHTML =
      '<div class="or-intro__rays" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>' +
      '<div class="or-intro__bubbles" aria-hidden="true">' + bubbles + "</div>" +
      '<canvas class="or-intro__gl" aria-hidden="true"></canvas>' +
      '<div class="or-intro__brand" aria-hidden="true">' +
      '<span class="or-intro__ring"></span>' +
      '<img alt="" src="' + assetUrl("logo.png") + '">' +
      "<strong>OceanRithm</strong>" +
      "<small>" + (de ? "Konzeptionelles Forschungsportal" : "Conceptual Research Portal") + "</small>" +
      "</div>" +
      '<button type="button" class="or-intro__skip">' + (de ? "Intro überspringen" : "Skip intro") + " &rsaquo;</button>";
    document.body.appendChild(el);

    var finished = false, raf = 0, manta = null, start = 0;

    function finish() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      try { sessionStorage.setItem("or-intro-seen", "1"); } catch (e) {}
      root.classList.remove("or-intro-pending");
      el.classList.add("or-intro--out");
      enterContent();
      setTimeout(function () {
        if (manta) manta.destroy();
        el.remove();
        if (done) done();
      }, 900);
    }

    el.querySelector(".or-intro__skip").addEventListener("click", finish);
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        document.removeEventListener("keydown", onKey);
        finish();
      }
    });

    var canvas = el.querySelector("canvas");
    var DUR = 4.6;

    loadManta(function (img) {
      if (finished) return;
      try {
        if (!img) throw new Error("img");
        manta = new Manta(canvas, img);
      } catch (e) {
        // No WebGL: show the brand and leave
        el.classList.add("or-intro--brand");
        setTimeout(finish, 1600);
        return;
      }
      start = performance.now();
      var narrow = window.innerWidth < 700;

      function frame(now) {
        var T = (now - start) / 1000;
        var a = manta.resize();
        var k = Math.min(T / 3.2, 1);
        var u = easeInOut(k);

        // path: far upper right, toward the camera, gliding out lower left.
        // depth shrinks exponentially so the growth feels steady, not a sudden jump
        var x = bez(narrow ? 1.6 : 4.2, 2.0, -0.2, narrow ? -0.9 : -1.6, u) * (0.35 + 0.65 * (1 - k));
        var y = bez(2.4, 1.6, 0.2, -0.9, u) * (0.35 + 0.65 * (1 - k));
        var z = -28 * Math.pow(0.9 / 28, Math.pow(k, 1.15));
        var fold = Math.max(0, 1 - T / 1.1);            // wings open at the start
        fold = fold * fold;
        var mvp = chain(
          M.persp(0.9, a, 0.1, 100),
          M.tr(x, y, z),
          M.ry(-0.45 + u * 0.75),
          M.rx(-0.35 + 0.12 * Math.sin(T * 1.7)),
          M.rz(0.12 * Math.sin(T * 2.1)),
          M.sc(narrow ? 1.35 : 1.75)
        );
        var alpha = Math.min(1, T / 0.4) * (k > 0.84 ? Math.max(0, 1 - (k - 0.84) / 0.16) : 1);
        manta.draw({ mvp: mvp, t: T, amp: 0.34, fold: fold * 1.1, speed: 2.9, alpha: alpha,
          fog: [0.012, 0.075, 0.125], fogNear: 4, fogFar: 42 });

        if (T > 2.75) el.classList.add("or-intro--brand");
        if (T >= DUR) return finish();
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
    });
  }

  /* ---------------- Page entrance + swim on page change ---------------- */
  function enterContent() {
    if (reduceMotion) return;
    var c = document.querySelector(".md-content");
    if (!c) return;
    c.classList.remove("or-enter");
    void c.offsetWidth;
    c.classList.add("or-enter");
    setTimeout(function () { c.classList.remove("or-enter"); }, 1000);
  }

  var swimFlip = false;
  function swim() {
    if (reduceMotion) return;
    var s = document.createElement("div");
    s.className = "or-swim" + (swimFlip ? " or-swim--alt" : "");
    swimFlip = !swimFlip;
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = '<img alt="" src="' + assetUrl("manta.png") + '">';
    document.body.appendChild(s);
    setTimeout(function () { s.remove(); }, 1700);
  }

  /* ---------------- Home hero: live manta ---------------- */
  var heroCleanup = null;
  function initHero() {
    if (heroCleanup) { heroCleanup(); heroCleanup = null; }
    var hero = document.querySelector(".or-hero");
    if (!hero) return;

    // 3D tilt of the whole hero on desktop
    var tx = 0, ty = 0;
    function onMove(e) {
      var r = hero.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      ty = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!reduceMotion && finePointer) {
        hero.style.transform = "perspective(1400px) rotateX(" + (-ty * 3).toFixed(2) + "deg) rotateY(" + (tx * 4).toFixed(2) + "deg)";
      }
    }
    function onLeave() { tx = 0; ty = 0; hero.style.transform = ""; }
    hero.addEventListener("pointermove", onMove);
    hero.addEventListener("pointerleave", onLeave);

    var stop = function () {
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerleave", onLeave);
    };
    heroCleanup = stop;
    if (reduceMotion) return;
    var phone = window.innerWidth < 700;

    var img = hero.querySelector(".or-hero__manta");
    loadManta(function (tex) {
      if (!tex || !document.body.contains(hero)) return;
      var canvas = document.createElement("canvas");
      canvas.className = "or-hero__gl";
      canvas.setAttribute("aria-hidden", "true");
      hero.appendChild(canvas);
      var manta;
      try { manta = new Manta(canvas, tex); } catch (e) { canvas.remove(); return; }
      hero.classList.add("or-hero--live");

      var raf = 0, visible = true, t0 = performance.now(), cx = 0, cy = 0;
      var io = new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(frame);
      });
      io.observe(hero);

      var lastHero = 0;
      function frame(now) {
        raf = 0;
        if (!visible || document.hidden) return;
        // phones: 30 fps keeps the manta smooth and the battery happy
        if (phone && now - lastHero < 31) { raf = requestAnimationFrame(frame); return; }
        lastHero = now;
        var T = (now - t0) / 1000;
        var a = manta.resize();
        cx += (tx - cx) * 0.06;
        cy += (ty - cy) * 0.06;
        var mvp = chain(
          M.persp(0.75, a, 0.1, 50),
          M.tr(0.05 + cx * 0.15, Math.sin(T * 0.9) * 0.09 - cy * 0.1, -4.4),
          M.ry(cx * 0.45 + Math.sin(T * 0.4) * 0.08),
          M.rx(-0.2 + cy * 0.3),
          M.rz(-0.1 + Math.sin(T * 0.7) * 0.06),
          M.sc(phone ? 1.75 : 1.35)
        );
        manta.draw({ mvp: mvp, t: T, amp: 0.26, speed: 2.2, fogNear: 100, fogFar: 101,
          alpha: Math.min(1, T / 0.6) });
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
      function onVis() { if (!document.hidden && !raf) raf = requestAnimationFrame(frame); }
      document.addEventListener("visibilitychange", onVis);

      heroCleanup = function () {
        stop();
        cancelAnimationFrame(raf);
        io.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        manta.destroy();
      };
      if (img) img.setAttribute("aria-hidden", "true");
    });
  }

  /* ---------------- Tilt cards ---------------- */
  function initTilt() {
    if (reduceMotion || !finePointer) return;
    var cards = document.querySelectorAll(".md-typeset .grid.cards > ul > li");
    Array.prototype.forEach.call(cards, function (card) {
      if (card.dataset.orTilt) return;
      card.dataset.orTilt = "1";
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        card.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
        card.style.setProperty("--my", (y * 100).toFixed(1) + "%");
        card.style.transform = "perspective(900px) rotateX(" + ((0.5 - y) * 12).toFixed(2) + "deg) rotateY(" +
          ((x - 0.5) * 14).toFixed(2) + "deg) translateZ(18px)";
        card.classList.add("or-tilting");
      });
      card.addEventListener("pointerleave", function () {
        card.style.transform = "";
        card.classList.remove("or-tilting");
      });
    });
  }

  /* ---------------- Scroll reveal ---------------- */
  var revealIO = null;
  function initReveal() {
    if (revealIO) revealIO.disconnect();
    var sel = ".md-typeset h2, .md-typeset .grid.cards > ul > li, .md-typeset .admonition, .or-layers, .or-flow, .or-chips";
    var els = document.querySelectorAll(sel);
    if (reduceMotion || !("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(els, function (e) { e.classList.add("or-in"); });
      return;
    }
    revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("or-in");
          revealIO.unobserve(en.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    Array.prototype.forEach.call(els, function (e, i) {
      e.classList.add("or-reveal");
      if (e.matches(".grid.cards > ul > li")) {
        var idx = Array.prototype.indexOf.call(e.parentNode.children, e);
        e.style.setProperty("--or-delay", (idx % 3) * 90 + "ms");
      }
      revealIO.observe(e);
    });
  }

  /* shared with js/abyss.js */
  window.ORMotion = {
    Manta: Manta, M: M, chain: chain, loadManta: loadManta, assetUrl: assetUrl,
    reduceMotion: reduceMotion, finePointer: finePointer
  };

  /* ---------------- Flow: turn the arrow lines into a diagram ----------------
     The markdown keeps the original text ("User / -> Interaction Layer ...").
     Here each line becomes a box; the arrow sign is drawn as a connector. */
  function initFlow() {
    var ps = document.querySelectorAll(".or-flow > p");
    Array.prototype.forEach.call(ps, function (p) {
      var parts = p.innerHTML.split(/<br\s*\/?>/i)
        .map(function (h) { return h.replace(/^\s*(\u2192|&rarr;)\s*/, "").trim(); })
        .filter(Boolean);
      if (parts.length < 2) return;
      var ul = document.createElement("ul");
      parts.forEach(function (h) {
        var li = document.createElement("li");
        li.innerHTML = h;
        ul.appendChild(li);
      });
      p.parentNode.replaceChild(ul, p);
    });
  }

  /* ---------------- wiring ---------------- */
  var first = true;
  function onPage() {
    initFlow();
    initHero();
    initTilt();
    initReveal();
    if (first) {
      first = false;
      if (root.classList.contains("or-intro-pending")) {
        playIntro();
      } else {
        // full page load coming from another page of this site: swim too
        var internal = false;
        try { internal = !!document.referrer && new URL(document.referrer).origin === window.location.origin; } catch (e) {}
        if (internal) swim();
        enterContent();
      }
    } else {
      swim();
      enterContent();
    }
  }

  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(onPage);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onPage);
  } else {
    onPage();
  }
})();
