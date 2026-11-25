// EN | DE switcher in the Material header.
// Works with instant navigation: the button is created once and its
// active state is refreshed on every page change.
(function () {
  "use strict";

  function detectLang(pathname) {
    return /\/de\//.test(pathname) ? "de" : "en";
  }

  // Split /base/en/page/ into base and page so the same page opens in the other language
  function targetUrl(lang) {
    var loc = window.location;
    var m = loc.pathname.match(/^(.*?)(\/en\/|\/de\/)(.*)$/);
    var base = m ? m[1] : loc.pathname.replace(/\/+$/, "");
    var page = m ? m[3] : "";
    return (base || "") + "/" + lang + "/" + page + (loc.search || "") + (loc.hash || "");
  }

  function ensureSwitcher() {
    var header = document.querySelector(".md-header__inner");
    if (!header) return null;
    var sw = header.querySelector(".or-lang-switcher");
    if (sw) return sw;

    sw = document.createElement("div");
    sw.className = "or-lang-switcher";
    sw.setAttribute("role", "group");
    sw.setAttribute("aria-label", "Language");
    sw.innerHTML =
      '<button type="button" data-lang="en" class="or-lang-btn" lang="en">EN</button>' +
      '<button type="button" data-lang="de" class="or-lang-btn" lang="de">DE</button>';
    header.appendChild(sw);

    sw.addEventListener("click", function (e) {
      var btn = e.target.closest(".or-lang-btn");
      if (!btn) return;
      var lang = btn.dataset.lang;
      if (lang === detectLang(window.location.pathname)) return;
      window.location.href = targetUrl(lang);
    });
    return sw;
  }

  function refresh() {
    var sw = ensureSwitcher();
    if (!sw) return;
    var current = detectLang(window.location.pathname);
    Array.prototype.forEach.call(sw.querySelectorAll(".or-lang-btn"), function (b) {
      var on = b.dataset.lang === current;
      b.classList.toggle("or-lang-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(refresh);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh);
  } else {
    refresh();
  }
})();
