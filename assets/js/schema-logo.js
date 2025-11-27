// docs/assets/js/schema-logo.js
(function() {
  var script = document.createElement('script');
  script.type = 'application/ld+json';
  script.text = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "OceanRithm Solutions UG (haftungsbeschränkt)",
    "url": "https://oceanrithm.com",
    "logo": "https://oceanrithm.com/assets/logo/oceanrithm-logo.png"
  });
  document.head.appendChild(script);
})();
