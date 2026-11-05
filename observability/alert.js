// Creates (or updates) the alert in Dash0: "Cloud saves failing", e-mailed to the owner.
// npm run alert   (reads DASH0_API_URL and DASH0_AUTH_TOKEN from .env)
// Fires when any save in the last 5 minutes failed with a server error: a player's progress did not reach the cloud.
// saves_total starts at 0 for both outcomes (server/index.js), so the first failure is already an increase.
const { DASH0_API_URL: API, DASH0_AUTH_TOKEN: TOKEN, OWNER_EMAIL = 'adacquay@gmail.com' } = process.env;
if (!API || !TOKEN) { console.error('Set DASH0_API_URL and DASH0_AUTH_TOKEN (see .env.example)'); process.exit(1); }

const CHANNEL = 'immune-citadel-owner-email';
const channel = {
  kind: 'Dash0NotificationChannel',
  metadata: { name: 'Immune Citadel owner email', labels: { 'dash0.com/origin': CHANNEL } },
  spec: { type: 'email_v2', config: { recipients: [OWNER_EMAIL] } },
};
const rule = {
  name: 'Cloud saves failing',
  expression: 'sum(increase(saves_total{service_name="immune-citadel-api", outcome="failed"}[5m])) > $__threshold',
  thresholds: { degraded: 0.5, failed: 0.5 },
  interval: '1m',
  for: '0s',
  labels: { severity: 'critical' },
  annotations: {
    summary: "Players' cloud saves fail with server errors; their progress does not reach the cloud.",
    runbook: 'https://github.com/alexisdacquay/immune-citadel-v4/blob/dev/docs/OPERATIONS.md#alert-cloud-saves-failing',
    'dash0.com/notification-channel-ids': CHANNEL,
  },
  enabled: true,
};

const put = async (path, body) => {
  const r = await fetch(`${API}${path}`, { method: 'PUT', headers: { authorization: `Bearer ${TOKEN.trim()}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${await r.text()}`);
  console.log(`${path}: HTTP ${r.status}`);
};
(async () => {
  await put(`/api/notification-channels/${CHANNEL}`, channel);
  await put('/api/alerting/check-rules/immune-citadel-cloud-saves-failing', rule);
})().catch(e => { console.error(e.message); process.exit(1); });
