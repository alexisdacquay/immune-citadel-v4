// Sentry for the save API: errors and request traces (docs/OBSERVABILITY-PLAN.md, steps 1-2). Off without SENTRY_DSN.
// Children's data stays home: no IP, headers, cookies, bodies, query strings, query parameters or local variables,
// and any save code (the player's only credential) is replaced before an event leaves the process.
const Sentry = require('@sentry/node');
const CODE_ANYWHERE = /[A-HJ-NP-Z2-9]{16}/g; // the save-code alphabet, as in index.js
const scrub = item => JSON.parse(JSON.stringify(item).replace(CODE_ANYWHERE, ':code'));

function initSentry(extra = {}) {
  if (!process.env.SENTRY_DSN && !extra.dsn) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'local',
    release: process.env.RENDER_GIT_COMMIT,
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, databaseQueryData: false, stackFrameVariables: false },
    tracesSampler: ({ attributes }) => (attributes?.['url.path'] === '/health' ? 0 : 1), // every request (a few thousand a month), not Render's health checks
    beforeSend: scrub, beforeSendSpan: scrub, // v11 streams spans: beforeSendSpan covers traces
    ...extra,
  });
}

module.exports = { initSentry, Sentry };
