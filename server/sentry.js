// Sentry for the save API: errors, request traces, and one log line and one metric per save or load (docs/OPERATIONS.md#telemetry). Off without SENTRY_DSN.
// Children's data stays home: no IP, headers, cookies, bodies, query strings, query parameters, local variables or browser identifier (user agent),
// and any save code (the player's only credential) is replaced before anything leaves the process.
const Sentry = require('@sentry/node');
const CODE_ANYWHERE = /[A-HJ-NP-Z2-9]{16}/g; // the save-code alphabet, as in index.js
const scrub = item => JSON.parse(JSON.stringify(item, (k, v) => (/user.?agent/i.test(k) ? undefined : v)).replace(CODE_ANYWHERE, ':code')); // the span keeps user_agent.original even with httpHeaders off

function initSentry(extra = {}) {
  if (!process.env.SENTRY_DSN && !extra.dsn) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'local',
    release: process.env.RENDER_GIT_COMMIT,
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, databaseQueryData: false, stackFrameVariables: false },
    tracesSampler: ({ attributes }) => (['/health', '/api/play'].includes(attributes?.['url.path']) ? 0 : 1), // every request (a few thousand a month); not Render's health checks, not gameplay events (no third party sees play)
    beforeSend: scrub, beforeSendSpan: scrub, beforeSendLog: scrub, beforeSendMetric: scrub, // v11 streams spans: beforeSendSpan covers traces
    ...extra,
  });
}

module.exports = { initSentry, Sentry };
