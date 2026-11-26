/* Public module configuration (no secrets). preview: true validates the forms and shows the confirmation without
   sending anything; switch to false once the lead endpoint and the Google Sheet are connected.
   Tracking IDs come later; with every ID null no external script loads. */
window.CS_CONFIG = {
  siteId: 'signature-business',
  preview: true,
  lead: {
    endpoint: '/api/lead.php',
    redirect: null,
    smsConsentVersion: 'msg-ptbr-en-v1-2026-11-26'
  },
  serviceArea: { zips: [], outOfArea: 'accept-with-message' },
  tracking: {
    mode: 'direct',
    ga4: null,
    metaPixel: null,
    googleAds: null,
    gtm: null,
    consentDefault: 'granted',
    leadValue: null,
    debugParam: 'cs_debug'
  }
};

// preview copy: the form is simulated and nothing is tracked
window.CS_CONFIG = Object.assign({}, window.CS_CONFIG, { preview: true });
window.CS_CONFIG.lead = Object.assign({}, window.CS_CONFIG.lead, { endpoint: '/signature-business-preview/api/lead.php', redirect: null });
window.CS_CONFIG.tracking = Object.assign({}, window.CS_CONFIG.tracking, { mode: 'off', ga4: null, metaPixel: null, googleAds: null, gtm: null });
