// Sentry error reporting for the save API (docs/OBSERVABILITY-PLAN.md, step 1). Off without SENTRY_DSN.
// Children's data stays home: no IP, headers, cookies, bodies, query strings, query parameters or local variables,
// and any save code (the player's only credential) is replaced before an event leaves the process.
const Sentry = require('@sentry/node');
const CODE_ANYWHERE = /[A-HJ-NP-Z2-9]{16}/g; // the save-code alphabet, as in index.js

function initSentry(extra = {}) {
  if (!process.env.SENTRY_DSN && !extra.dsn) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'local',
    release: process.env.RENDER_GIT_COMMIT,
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, databaseQueryData: false, stackFrameVariables: false },
    beforeSend: event => JSON.parse(JSON.stringify(event).replace(CODE_ANYWHERE, ':code')),
    ...extra,
  });
}

module.exports = { initSentry, Sentry };
