(function () {
  var script = document.createElement('script');
  script.type = 'application/ld+json';
  script.text = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "OceanRithm Solutions UG (haftungsbeschränkt)",
    "url": "https://oceanrithm.com",
    "logo": "https://oceanrithm.com/images/logo.png",
    "founder": {
      "@type": "Person",
      "name": "Zahra Kheiroddin"
    },
    "foundingDate": "2025",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Berlin",
      "addressCountry": "DE"
    }
  });
  document.head.appendChild(script);
})();
