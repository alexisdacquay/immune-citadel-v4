// Fast checks that the pieces are wired to each other: game -> API -> Compose -> telemetry -> alert.
// Each one stands for a mistake that would otherwise only show up on a full run.
const test = require('node:test'), assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const compose = read('compose.yaml'), alerting = read('observability/alerting.yaml');

test('the game served by Compose calls the API port Compose publishes, and the API allows its origin', () => {
  assert.match(read('index.html'), /localhost: 'http:\/\/localhost:8787'/);
  assert.match(compose, /ports: \["8787:8787"\]/);
  assert.match(compose, /ports: \["8080:80"\]/);
  assert.match(compose, /ALLOWED_ORIGINS: .*http:\/\/localhost:8080/);
  assert.match(compose, /ALLOWED_ORIGINS: .*http:\/\/127\.0\.0\.1:8080/);
});

test('the API sends telemetry to the otel service, and Grafana loads the alert folder (not a single file)', () => {
  assert.match(compose, /OTEL_EXPORTER_OTLP_ENDPOINT: http:\/\/otel:4318/);
  assert.match(compose, /- \.\/observability:\/otel-lgtm\/grafana\/conf\/provisioning\/alerting|\[\.\/observability:\/otel-lgtm\/grafana\/conf\/provisioning\/alerting/);
  assert.match(read('server/Dockerfile'), /--require", "\.\/otel\.js"/);
});

test('the alert counts failed saves and is routed to a contact point that exists', () => {
  assert.match(alerting, /saves_total\{[^}]*outcome="failed"/);
  const receiver = alerting.match(/receiver: (\S+)/)[1];
  assert.match(alerting, new RegExp(`name: ${receiver}\\b`));
});

test('production runs the API without telemetry', () => {
  assert.equal(JSON.parse(read('server/package.json')).scripts.start, 'node index.js');
});
