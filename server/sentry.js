// Sentry for the save API: errors, request traces, and one log line and one metric per save or load (docs/OPERATIONS.md#telemetry). Off without SENTRY_DSN.
// Children's data stays home: no IP, headers, cookies, bodies, query strings, query parameters, local variables or browser identifier (user agent),
// and any save code (the player's only credential) is replaced before anything leaves the process.
const Sentry = require('@sentry/node');
const CODE_ANYWHERE = /[A-HJ-NP-Z2-9]{16}/g; // the save-code alphabet, as in index.js
const IDS = new Set(['trace_id', 'span_id', 'parent_span_id']); // Sentry's own hex IDs, never a save code: kept whole, or 16 digits in a row would break the link to Render's log line
const hide = v => { // a URL (url.full, url.path) can carry the code in lower case or percent-encoded, as route.js handles: decoded and matched in any case.
  if (!v.includes('/')) return v.replace(CODE_ANYWHERE, ':code'); // only paths: in any case, a 16-character run of lower-case hex (an ID) would match too
  let d = v; try { d = decodeURIComponent(v); } catch { /* malformed encoding: match the raw text */ }
  const out = d.replace(new RegExp(CODE_ANYWHERE.source, 'gi'), ':code');
  return out === d ? v : out;
};
const scrub = item => JSON.parse(JSON.stringify(item, (k, v) => (/user.?agent/i.test(k) ? undefined // the span keeps user_agent.original even with httpHeaders off
  : typeof v === 'string' && !IDS.has(k) ? hide(v) : v)));

function initSentry(extra = {}) {
  if (!process.env.SENTRY_DSN && !extra.dsn) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'local',
    release: process.env.RENDER_GIT_COMMIT,
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, databaseQueryData: false, stackFrameVariables: false },
    tracesSampler: ({ attributes }) => (['/health', '/api/play'].includes(attributes?.['url.path']) ? 0 : 1), // every request (a few thousand a month); not Render's health checks, not gameplay events (no third party sees play)
    sendClientReports: false, // not even a count of the gameplay requests left out
    beforeSend: scrub, beforeSendSpan: scrub, beforeSendLog: scrub, beforeSendMetric: scrub, // v11 streams spans: beforeSendSpan covers traces
    ...extra,
  });
}

module.exports = { initSentry, Sentry };
