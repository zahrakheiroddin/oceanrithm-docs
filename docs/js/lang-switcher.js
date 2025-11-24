// Language switcher for MkDocs Material header
document.addEventListener("DOMContentLoaded", () => {
  // Find the header container where we will inject the switcher
  const headerInner = document.querySelector(".md-header__inner");
  if (!headerInner) return;

  // Create language switcher container and buttons (EN | DE)
  const switcher = document.createElement("div");
  switcher.className = "or-lang-switcher";
  switcher.innerHTML = `
    <button data-lang="en" class="or-lang-btn or-lang-active">EN</button>
    <span class="or-lang-sep">|</span>
    <button data-lang="de" class="or-lang-btn">DE</button>
  `;
  headerInner.appendChild(switcher);

  const buttons = switcher.querySelectorAll(".or-lang-btn");

  // Detect current language from URL path
  function detectLang(pathname) {
    if (pathname.includes("/de/")) return "de";
    if (pathname.includes("/en/")) return "en";
    // Default language
    return "en";
  }

  // Split URL into: base part + /en/|/de/ + page path
  // Example: /en/background/  → base="", lang="/en/", page="background/"
  // Example: /oceanrithm-docs/en/background/ → base="/oceanrithm-docs", page="background/"
  function getBaseAndPage(pathname) {
    const match = pathname.match(/^(.*?)(\/en\/|\/de\/)(.*)$/);
    if (!match) {
      // If URL doesn't contain /en/ or /de/, treat everything as base
      return { base: pathname.replace(/\/+$/, ""), page: "" };
    }
    return {
      base: match[1] || "",
      page: match[3] || ""
    };
  }

  // Build target URL when user switches language
  function buildTargetUrl(targetLang) {
    const { pathname, search, hash } = window.location;
    const currentLang = detectLang(pathname);
    const { base, page } = getBaseAndPage(pathname);

    // Target language segment, e.g. "/en/" or "/de/"
    const langSegment = "/" + targetLang + "/";

    // Keep the same page slug if possible
    const targetPage = page || "";

    // Reconstruct the URL: base + /lang/ + page + query + hash
    const targetPath = (base || "") + langSegment + targetPage;
    return targetPath + (search || "") + (hash || "");
  }

  // Visually mark the active language button
  function updateActive(lang) {
    buttons.forEach(btn => {
      btn.classList.toggle("or-lang-active", btn.dataset.lang === lang);
    });
  }

  // Initialize active state based on current URL
  const currentLang = detectLang(window.location.pathname);
  updateActive(currentLang);

  // Handle language switch on button click
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetLang = btn.dataset.lang;
      if (targetLang === currentLang) return; // No change

      const targetUrl = buildTargetUrl(targetLang);
      window.location.href = targetUrl;
    });
  });
});
