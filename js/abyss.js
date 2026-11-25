/* =========================================================
   OceanRithm: the abyss
   One living WebGL world behind every page:
   - deep water with light rays and caustics from the surface
   - marine snow, bioluminescent plankton and drifting code glyphs
   - a neural network that fires and reaches toward the cursor
   - a manta that sometimes glides past in the distance
   - the visitor descends while scrolling and dives on page change
   - depth gauge and optional ambient sound (generated, no files)
   Needs js/ocean.js (window.ORMotion). No external requests.
   ========================================================= */
(function () {
  "use strict";

  var OR = window.ORMotion;
  if (!OR) return;
  var reduce = OR.reduceMotion;
  var root = document.documentElement;
  var small = Math.min(window.innerWidth, window.innerHeight) < 600;

  /* ---------------- canvas + context ---------------- */
  var canvas = document.createElement("canvas");
  canvas.className = "or-abyss";
  canvas.setAttribute("aria-hidden", "true");
  document.body.insertBefore(canvas, document.body.firstChild);
  var gl = canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: true, powerPreference: "low-power" });
  if (!gl) { canvas.remove(); return; }
  root.classList.add("or-abyss-on");

  function compile(vs, fs) {
    function sh(t, src) {
      var s = gl.createShader(t);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function uniforms(p, names) {
    var u = {};
    names.forEach(function (n) { u[n] = gl.getUniformLocation(p, n); });
    return u;
  }

  /* ---------------- 1) water: gradient, rays, caustics, cursor light ---------------- */
  var waterP = compile(
    "attribute vec2 aP; void main(){ gl_Position = vec4(aP, 0.0, 1.0); }",
    [
      "precision mediump float;",
      "uniform vec2 uRes; uniform float uT, uDepth, uLight; uniform vec2 uMouse;",
      "float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
      "float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);",
      "  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }",
      "float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a*n(p); p *= 2.03; a *= 0.5; } return v; }",
      "void main(){",
      "  vec2 uv = gl_FragCoord.xy / uRes;",
      "  float d = clamp(uDepth, 0.0, 1.0);",
      "  vec3 top = mix(vec3(0.04, 0.26, 0.40), vec3(0.55, 0.86, 0.93), uLight);",
      "  vec3 bot = mix(vec3(0.004, 0.018, 0.035), vec3(0.16, 0.50, 0.64), uLight);",
      "  top = mix(top, bot * 1.8 + vec3(0.0, 0.02, 0.04), d * 0.75);",
      "  vec3 col = mix(bot, top, pow(uv.y, 1.5));",
      "  vec2 p = uv - vec2(0.5 + 0.08 * sin(uT * 0.04), 1.35);",
      "  float ang = atan(p.x, -p.y);",
      "  float r = fbm(vec2(ang * 7.0, uT * 0.07));",
      "  r = smoothstep(0.48, 0.92, r) * smoothstep(0.0, 1.0, uv.y);",
      "  col += r * (0.20 - 0.16 * d) * mix(vec3(0.5, 0.85, 0.95), vec3(1.0), uLight);",
      "  float c = fbm(uv * vec2(7.0, 3.5) + vec2(uT * 0.05, -uT * 0.03));",
      "  c = pow(abs(sin(c * 13.0)), 9.0);",
      "  col += c * 0.06 * smoothstep(0.5, 1.0, uv.y) * (1.0 - d);",
      "  vec2 m = (gl_FragCoord.xy - uMouse) / uRes.y;",
      "  col += mix(vec3(0.05, 0.30, 0.36), vec3(0.10, 0.20, 0.22), uLight) * 0.35 * exp(-dot(m, m) * 16.0);",
      "  vec2 q = uv - 0.5; col *= 1.0 - dot(q, q) * 0.7;",
      "  col += (h(gl_FragCoord.xy + uT) - 0.5) / 255.0 * 2.0;",
      "  gl_FragColor = vec4(col, 1.0);",
      "}"
    ].join("\n")
  );
  var waterU = uniforms(waterP, ["uRes", "uT", "uDepth", "uLight", "uMouse"]);
  var quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var waterLoc = gl.getAttribLocation(waterP, "aP");

  /* ---------------- 2) particles: snow, plankton, code glyphs ---------------- */
  var glyphs = ["0", "1", "{", "}", "<", ">", "/", "=", "λ", "∑", "#", "$", "*", ";", "→", "∅"];
  var atlas = document.createElement("canvas");
  atlas.width = atlas.height = 256;
  var actx = atlas.getContext("2d");
  actx.fillStyle = "#fff";
  actx.textAlign = "center";
  actx.textBaseline = "middle";
  actx.font = "600 40px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  glyphs.forEach(function (g, i) { actx.fillText(g, (i % 4) * 64 + 32, Math.floor(i / 4) * 64 + 34); });
  var atlasTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  var partP = compile(
    [
      "attribute vec4 aA; attribute float aK;",
      "uniform float uT, uRise, uAspect, uScroll, uScale;",
      "uniform vec2 uMouse01;",
      "varying float vK, vA, vG;",
      "void main(){",
      "  float z = aA.z, s = aA.w;",
      "  float x = aA.x + 0.025 * sin(uT * 0.09 + s * 31.0) + (uMouse01.x - 0.5) * 0.035 * z;",
      "  float y = aA.y + uRise * (0.35 + z) + uScroll * 0.6 * z + 0.02 * sin(uT * 0.12 + s * 17.0);",
      "  if (aK < 0.5) y -= uT * 0.004 * (0.5 + z);",
      "  x = fract(x); y = fract(y);",
      "  vec2 dm = (vec2(x, y) - uMouse01) * vec2(uAspect, 1.0);",
      "  float near = exp(-dot(dm, dm) * 30.0);",
      "  vec2 push = normalize(dm + 1e-5) * near * 0.035 * z;",
      "  vec2 pos = vec2(x, y) + push / vec2(uAspect, 1.0);",
      "  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);",
      "  float size = aK < 0.5 ? (1.2 + 2.6 * z) : (aK < 1.5 ? (4.0 + 7.0 * z) : (11.0 + 12.0 * z));",
      "  gl_PointSize = size * uScale * (1.0 + near * 0.9);",
      "  float tw = 0.55 + 0.45 * sin(uT * (0.4 + s * 1.7) + s * 40.0);",
      "  vA = aK < 0.5 ? 0.30 * z + 0.05 : (aK < 1.5 ? (0.18 + 0.82 * near) * tw : (0.10 + 0.70 * near) * tw * (0.4 + 0.6 * z));",
      "  vK = aK; vG = floor(s * 15.99);",
      "}"
    ].join("\n"),
    [
      "precision mediump float;",
      "uniform sampler2D uGlyphs; uniform float uLight;",
      "varying float vK, vA, vG;",
      "void main(){",
      "  vec2 pc = gl_PointCoord; float a; vec3 col;",
      "  float d = length(pc - 0.5);",
      "  if (vK < 0.5) { a = smoothstep(0.5, 0.05, d); col = vec3(0.78, 0.90, 0.96); }",
      "  else if (vK < 1.5) { a = exp(-d * d * 26.0) + 0.5 * exp(-d * d * 140.0); col = vec3(0.30, 0.98, 0.95); }",
      "  else { vec2 cell = vec2(mod(vG, 4.0), floor(vG / 4.0)); a = texture2D(uGlyphs, (cell + pc) / 4.0).a; col = vec3(0.40, 0.92, 1.0); }",
      "  col = mix(col, vec3(0.02, 0.30, 0.40), uLight);",
      "  a *= vA;",
      "  gl_FragColor = vec4(col * a, a * uLight);",
      "}"
    ].join("\n")
  );
  var partU = uniforms(partP, ["uT", "uRise", "uAspect", "uScroll", "uScale", "uMouse01", "uGlyphs", "uLight"]);
  var counts = small ? [190, 55, 26] : [620, 150, 80];
  var pdata = [], pkind = [];
  counts.forEach(function (c, k) {
    for (var i = 0; i < c; i++) {
      pdata.push(Math.random(), Math.random(), 0.15 + Math.random() * 0.85, Math.random());
      pkind.push(k);
    }
  });
  var pCount = pkind.length;
  var pBufA = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pBufA);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pdata), gl.STATIC_DRAW);
  var pBufK = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pBufK);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pkind), gl.STATIC_DRAW);
  var pLocA = gl.getAttribLocation(partP, "aA");
  var pLocK = gl.getAttribLocation(partP, "aK");

  /* ---------------- 3) neural network: nodes, links, firing pulses ---------------- */
  var netP = compile(
    [
      "attribute vec2 aP; attribute float aAl; attribute float aS;",
      "uniform float uScale;",
      "varying float vA;",
      "void main(){ gl_Position = vec4(aP, 0.0, 1.0); gl_PointSize = aS * uScale; vA = aAl; }"
    ].join("\n"),
    [
      "precision mediump float;",
      "uniform float uPoint, uLight;",
      "varying float vA;",
      "void main(){",
      "  float a = vA;",
      "  if (uPoint > 0.5) { float d = length(gl_PointCoord - 0.5); a *= exp(-d * d * 22.0) + 0.6 * exp(-d * d * 120.0); }",
      "  vec3 col = mix(vec3(0.35, 0.95, 1.0), vec3(0.03, 0.32, 0.42), uLight);",
      "  gl_FragColor = vec4(col * a, a * uLight);",
      "}"
    ].join("\n")
  );
  var netU = uniforms(netP, ["uScale", "uPoint", "uLight"]);
  var netLocP = gl.getAttribLocation(netP, "aP");
  var netLocA = gl.getAttribLocation(netP, "aAl");
  var netLocS = gl.getAttribLocation(netP, "aS");
  var netBuf = gl.createBuffer();

  var NODES = small ? 34 : 86;
  var nodes = [];
  for (var i = 0; i < NODES; i++) {
    nodes.push({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.008, vy: (Math.random() - 0.5) * 0.006,
      p: Math.random() * 6.28
    });
  }
  var pulses = [];
  var LINK = small ? 0.2 : 0.16;

  /* ---------------- 4) a distant manta ---------------- */
  var manta = null, mantaRun = null, nextManta = 5 + Math.random() * 4;
  OR.loadManta(function (img) {
    if (!img) return;
    try { manta = new OR.Manta(gl, img); } catch (e) { manta = null; }
  });

  /* ---------------- state ---------------- */
  var W = 1, H = 1, aspect = 1, scale = 1;
  var mouse = { x: -9999, y: -9999, on: false }, mouse01 = [0.5, 0.5], smoothMouse = [0.5, 0.5];
  var rise = 0, dive = 0, scroll01 = 0, depthTarget = 0, depthShown = 0, light = 0;
  var t0 = performance.now(), last = t0, raf = 0;

  var lastW = 0;
  function resize() {
    // phones: the address bar changes the height while scrolling; ignore that,
    // otherwise the canvas would be rebuilt on every scroll (jank)
    if (small && lastW === window.innerWidth && canvas.width) return;
    lastW = window.innerWidth;
    var dpr = small ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    W = Math.round(window.innerWidth * dpr);
    H = Math.round((small ? Math.max(window.innerHeight, screen.height || 0) : window.innerHeight) * dpr);
    canvas.width = W;
    canvas.height = H;
    aspect = W / H;
    scale = dpr;
    gl.viewport(0, 0, W, H);
  }
  resize();
  window.addEventListener("resize", resize);

  window.addEventListener("pointermove", function (e) {
    mouse.x = e.clientX * scale;
    mouse.y = (window.innerHeight - e.clientY) * scale;
    mouse.on = true;
    mouse01 = [e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight];
  }, { passive: true });
  document.addEventListener("pointerleave", function () { mouse.on = false; });

  function readScheme() {
    var b = document.body.getAttribute("data-md-color-scheme");
    light = b === "default" ? 1 : 0;
  }
  readScheme();
  new MutationObserver(readScheme).observe(document.body, { attributes: true, attributeFilter: ["data-md-color-scheme"] });

  /* ---------------- depth gauge ---------------- */
  var hud = document.createElement("div");
  hud.className = "or-hud";
  hud.innerHTML =
    '<div class="or-hud__gauge" aria-hidden="true"><i></i></div>' +
    '<div class="or-hud__read" aria-hidden="true"><span class="or-hud__label">DEPTH</span>' +
    '<span class="or-hud__val">0000 m</span><span class="or-hud__temp">18.0 °C</span></div>' +
    '<button type="button" class="or-hud__sound" aria-pressed="false" title="Ocean sound">' +
    '<span class="or-hud__wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="or-hud__stxt">SOUND OFF</span></button>';
  document.body.appendChild(hud);
  var hudVal = hud.querySelector(".or-hud__val");
  var hudTemp = hud.querySelector(".or-hud__temp");
  var hudBar = hud.querySelector(".or-hud__gauge i");

  function pageDepth() {
    var lang = /\/de\//.test(window.location.pathname) ? "/de/" : "/en/";
    var links = Array.prototype.slice.call(document.querySelectorAll(".md-nav--primary a.md-nav__link[href]"))
      .filter(function (l) {
        var h = l.getAttribute("href");
        return h.indexOf("#") === -1 && /\/(en|de)\//.test(l.href) && l.href.indexOf(lang) !== -1;
      });
    var active = document.querySelector(".md-nav--primary a.md-nav__link--active");
    var idx = active ? Math.max(0, links.indexOf(active)) : 0;
    return 40 + idx * 210;
  }
  var baseDepth = pageDepth();

  var lastY = window.scrollY;
  function onScroll() {
    if (small) {
      var y = window.scrollY;
      hud.classList.toggle("or-hud--away", y > lastY + 4 && y > 80);
      if (y < lastY - 4) hud.classList.remove("or-hud--away");
      lastY = y;
    }
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scroll01 = Math.min(1, window.scrollY / max);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------------- ambient sound (WebAudio, opt in) ---------------- */
  var audio = null;
  function startSound() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    var ac = new AC();
    var master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);

    // deep water: brown noise through a breathing low pass
    var len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0), lastOut = 0;
    for (var i = 0; i < len; i++) { var w = Math.random() * 2 - 1; lastOut = (lastOut + 0.02 * w) / 1.02; d[i] = lastOut * 3.2; }
    var src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    var lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 340; lp.Q.value = 0.8;
    var lfo = ac.createOscillator(); lfo.frequency.value = 0.06;
    var lfoG = ac.createGain(); lfoG.gain.value = 140;
    lfo.connect(lfoG); lfoG.connect(lp.frequency);
    var nG = ac.createGain(); nG.gain.value = 0.55;
    src.connect(lp); lp.connect(nG); nG.connect(master);
    src.start(); lfo.start();

    // low drone
    [55, 82.41, 110.3].forEach(function (f, k) {
      var o = ac.createOscillator(); o.type = "sine"; o.frequency.value = f;
      var g = ac.createGain(); g.gain.value = [0.05, 0.03, 0.012][k];
      o.connect(g); g.connect(master); o.start();
    });

    // sonar ping with echoes
    var delay = ac.createDelay(2); delay.delayTime.value = 0.48;
    var fb = ac.createGain(); fb.gain.value = 0.38;
    var dl = ac.createBiquadFilter(); dl.type = "lowpass"; dl.frequency.value = 1800;
    delay.connect(dl); dl.connect(fb); fb.connect(delay); dl.connect(master);
    function ping() {
      var o = ac.createOscillator(); o.type = "sine"; o.frequency.value = 1180;
      var g = ac.createGain(); var now = ac.currentTime;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.07, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
      o.connect(g); g.connect(master); g.connect(delay);
      o.start(now); o.stop(now + 2.3);
    }
    var pingTimer = setInterval(ping, 13000);
    setTimeout(ping, 1800);

    master.gain.linearRampToValueAtTime(0.5, ac.currentTime + 2);
    return {
      stop: function () {
        clearInterval(pingTimer);
        master.gain.linearRampToValueAtTime(0, ac.currentTime + 0.6);
        setTimeout(function () { ac.close(); }, 700);
      }
    };
  }
  var soundBtn = hud.querySelector(".or-hud__sound");
  soundBtn.addEventListener("click", function () {
    if (audio) {
      audio.stop(); audio = null;
      soundBtn.setAttribute("aria-pressed", "false");
      soundBtn.querySelector(".or-hud__stxt").textContent = "SOUND OFF";
      hud.classList.remove("or-hud--sound");
    } else {
      audio = startSound();
      if (!audio) return;
      soundBtn.setAttribute("aria-pressed", "true");
      soundBtn.querySelector(".or-hud__stxt").textContent = "SOUND ON";
      hud.classList.add("or-hud--sound");
    }
  });

  /* ---------------- page change: dive ---------------- */
  var firstPage = true;
  function onPage() {
    baseDepth = pageDepth();
    onScroll();
    if (firstPage) { firstPage = false; depthShown = baseDepth * 0.6; return; }
    if (!reduce) dive = 1;
  }
  if (window.document$ && window.document$.subscribe) window.document$.subscribe(onPage);
  else onPage();

  /* ---------------- render loop ---------------- */
  var netData = new Float32Array(4 * 4000);

  var lastDraw = 0;
  function frame(now) {
    raf = 0;
    if (document.hidden) return;
    // phones: 30 fps is plenty for slow water and saves battery
    if (small && !reduce && now - lastDraw < 31) { raf = requestAnimationFrame(frame); return; }
    lastDraw = now;
    var T = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    smoothMouse[0] += (mouse01[0] - smoothMouse[0]) * 0.08;
    smoothMouse[1] += (mouse01[1] - smoothMouse[1]) * 0.08;
    rise += dt * (0.003 + dive * 0.55);
    dive = Math.max(0, dive - dt * 0.9);

    depthTarget = baseDepth + scroll01 * 190;
    depthShown += (depthTarget - depthShown) * Math.min(1, dt * 2.2);
    var depth01 = Math.min(1, depthShown / 3400);

    // water
    gl.disable(gl.BLEND);
    gl.useProgram(waterP);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(waterLoc);
    gl.vertexAttribPointer(waterLoc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(waterU.uRes, W, H);
    gl.uniform1f(waterU.uT, T);
    gl.uniform1f(waterU.uDepth, depth01 * 0.9 + scroll01 * 0.1);
    gl.uniform1f(waterU.uLight, light);
    gl.uniform2f(waterU.uMouse, mouse.on ? mouse.x : -9999, mouse.on ? mouse.y : -9999);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(waterLoc);

    gl.enable(gl.BLEND);
    if (light) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.ONE, gl.ONE);

    // neural network
    var k = 0, nPts = 0;
    var mx = smoothMouse[0], my = smoothMouse[1];
    for (var a = 0; a < NODES; a++) {
      var n1 = nodes[a];
      n1.x += n1.vx * dt; n1.y += n1.vy * dt;
      if (n1.x < -0.05) n1.x += 1.1; if (n1.x > 1.05) n1.x -= 1.1;
      if (n1.y < -0.05) n1.y += 1.1; if (n1.y > 1.05) n1.y -= 1.1;
    }
    var edges = [];
    for (a = 0; a < NODES; a++) {
      var A = nodes[a];
      for (var b = a + 1; b < NODES; b++) {
        var B = nodes[b];
        var dx = (A.x - B.x) * aspect, dy = A.y - B.y, dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < LINK) {
          var al = (1 - dd / LINK) * 0.16;
          netData[k++] = A.x * 2 - 1; netData[k++] = A.y * 2 - 1; netData[k++] = al; netData[k++] = 1;
          netData[k++] = B.x * 2 - 1; netData[k++] = B.y * 2 - 1; netData[k++] = al; netData[k++] = 1;
          edges.push([a, b]);
        }
      }
      if (mouse.on) {
        var mdx = (A.x - mx) * aspect, mdy = A.y - my, md = Math.sqrt(mdx * mdx + mdy * mdy);
        if (md < LINK * 1.5) {
          var ma = (1 - md / (LINK * 1.5)) * 0.42;
          netData[k++] = A.x * 2 - 1; netData[k++] = A.y * 2 - 1; netData[k++] = ma; netData[k++] = 1;
          netData[k++] = mx * 2 - 1; netData[k++] = my * 2 - 1; netData[k++] = ma * 0.3; netData[k++] = 1;
        }
      }
    }
    var lineVerts = k / 4;

    if (!reduce && edges.length && Math.random() < dt * (small ? 2.5 : 5)) {
      var e = edges[(Math.random() * edges.length) | 0];
      pulses.push({ a: e[0], b: e[1], t: 0 });
    }
    var pStart = k;
    for (a = pulses.length - 1; a >= 0; a--) {
      var pu = pulses[a];
      pu.t += dt * 0.9;
      if (pu.t >= 1) { pulses.splice(a, 1); continue; }
      var P = nodes[pu.a], Q = nodes[pu.b];
      var px = P.x + (Q.x - P.x) * pu.t, py = P.y + (Q.y - P.y) * pu.t;
      netData[k++] = px * 2 - 1; netData[k++] = py * 2 - 1; netData[k++] = 0.9 * Math.sin(pu.t * Math.PI); netData[k++] = 9;
    }
    for (a = 0; a < NODES; a++) {
      var N = nodes[a];
      var ndx = (N.x - mx) * aspect, ndy = N.y - my;
      var glow = mouse.on ? Math.exp(-(ndx * ndx + ndy * ndy) * 30) : 0;
      netData[k++] = N.x * 2 - 1; netData[k++] = N.y * 2 - 1;
      netData[k++] = 0.22 + 0.18 * Math.sin(T * 1.3 + N.p) + glow * 0.7;
      netData[k++] = 6 + glow * 8;
    }
    nPts = (k - pStart) / 4;

    gl.useProgram(netP);
    gl.bindBuffer(gl.ARRAY_BUFFER, netBuf);
    gl.bufferData(gl.ARRAY_BUFFER, netData.subarray(0, k), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(netLocP); gl.enableVertexAttribArray(netLocA); gl.enableVertexAttribArray(netLocS);
    gl.vertexAttribPointer(netLocP, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(netLocA, 1, gl.FLOAT, false, 16, 8);
    gl.vertexAttribPointer(netLocS, 1, gl.FLOAT, false, 16, 12);
    gl.uniform1f(netU.uScale, scale);
    gl.uniform1f(netU.uLight, light);
    gl.uniform1f(netU.uPoint, 0);
    if (lineVerts) gl.drawArrays(gl.LINES, 0, lineVerts);
    gl.uniform1f(netU.uPoint, 1);
    if (nPts) gl.drawArrays(gl.POINTS, lineVerts, nPts);
    gl.disableVertexAttribArray(netLocP); gl.disableVertexAttribArray(netLocA); gl.disableVertexAttribArray(netLocS);

    // particles
    gl.useProgram(partP);
    gl.bindBuffer(gl.ARRAY_BUFFER, pBufA);
    gl.enableVertexAttribArray(pLocA);
    gl.vertexAttribPointer(pLocA, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, pBufK);
    gl.enableVertexAttribArray(pLocK);
    gl.vertexAttribPointer(pLocK, 1, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.uniform1i(partU.uGlyphs, 0);
    gl.uniform1f(partU.uT, T);
    gl.uniform1f(partU.uRise, rise);
    gl.uniform1f(partU.uAspect, aspect);
    gl.uniform1f(partU.uScroll, scroll01);
    gl.uniform1f(partU.uScale, scale);
    gl.uniform1f(partU.uLight, light);
    gl.uniform2f(partU.uMouse01, mouse.on ? smoothMouse[0] : -5, mouse.on ? smoothMouse[1] : -5);
    gl.drawArrays(gl.POINTS, 0, pCount);
    gl.disableVertexAttribArray(pLocA);
    gl.disableVertexAttribArray(pLocK);

    // distant manta
    if (manta && !reduce) {
      if (!mantaRun && T > nextManta) {
        var dir = Math.random() < 0.5 ? 1 : -1;
        mantaRun = { start: T, dur: 16 + Math.random() * 6, y0: 0.5 + Math.random() * 2, z: -(13 + Math.random() * 7), dir: dir };
      }
      if (mantaRun) {
        var u = (T - mantaRun.start) / mantaRun.dur;
        if (u >= 1) { mantaRun = null; nextManta = T + 18 + Math.random() * 16; }
        else {
          // always swims head first: head points lower left, so travel right to left and slightly down
          var x = 10 - u * 20, y = mantaRun.y0 - u * 2.2, z = mantaRun.z;
          var mvp = OR.chain(
            OR.M.persp(0.9, aspect, 0.1, 100),
            OR.M.tr(x * (aspect / 1.6), y, z),
            OR.M.ry(-0.25),
            OR.M.rx(-0.3 + 0.08 * Math.sin(T * 0.7)),
            OR.M.rz(0.08 * Math.sin(T * 0.5)),
            OR.M.sc(1.9)
          );
          var fade = Math.min(1, u * 6, (1 - u) * 6);
          manta.draw({
            mvp: mvp, t: T, amp: 0.3, speed: 1.9, noClear: true,
            alpha: 0.62 * fade,
            fog: light ? [0.32, 0.62, 0.72] : [0.012, 0.06, 0.1], fogNear: 6, fogFar: 26
          });
        }
      }
    }

    // gauge
    var dm = Math.round(depthShown);
    hudVal.textContent = ("0000" + dm).slice(-4) + " m";
    hudTemp.textContent = Math.max(2.1, 18 - dm / 160).toFixed(1) + " °C";
    hudBar.style.transform = "scaleY(" + Math.min(1, 0.04 + depthShown / 3400).toFixed(3) + ")";

    if (!reduce) raf = requestAnimationFrame(frame);
  }

  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) kick(); });
  if (reduce) {
    // one still frame, redrawn on resize / scheme change
    window.addEventListener("resize", function () { requestAnimationFrame(frame); });
    new MutationObserver(function () { requestAnimationFrame(frame); })
      .observe(document.body, { attributes: true, attributeFilter: ["data-md-color-scheme"] });
  }
  kick();
})();
