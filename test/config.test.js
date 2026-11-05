// Fast checks that the pieces are wired to each other: game -> API -> Compose -> telemetry -> alert.
// Each one stands for a mistake that would otherwise only show up on a full run.
const test = require('node:test'), assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const compose = read('compose.yaml');

test('the game served by Compose calls the API port Compose publishes, and the API allows its origin', () => {
  assert.match(read('index.html'), /localhost: 'http:\/\/localhost:8787'/);
  assert.match(compose, /ports: \["8787:8787"\]/);
  assert.match(compose, /ports: \["8080:80"\]/);
  assert.match(compose, /ALLOWED_ORIGINS: .*http:\/\/localhost:8080/);
  assert.match(compose, /ALLOWED_ORIGINS: .*http:\/\/127\.0\.0\.1:8080/);
});

test('the API loads telemetry wherever it starts, and Compose takes the Dash0 settings from .env only', () => {
  assert.equal(JSON.parse(read('server/package.json')).scripts.start, 'node --require ./otel.js index.js');
  assert.match(read('server/Dockerfile'), /CMD \["npm", "start"\]/);
  assert.match(compose, /OTEL_EXPORTER_OTLP_HEADERS: \$\{OTEL_EXPORTER_OTLP_HEADERS:-\}/);
  assert.doesNotMatch(compose + read('.env.example'), /auth_[A-Za-z0-9]{10,}/, 'no real token in tracked files');
  assert.match(read('.gitignore'), /^\.env$/m);
});

test('the alert counts failed saves and notifies a channel it also creates', () => {
  const alert = read('observability/alert.js');
  assert.match(alert, /saves_total\{[^}]*outcome="failed"/);
  const channel = alert.match(/const CHANNEL = '([^']+)'/)[1];
  assert.match(alert, /'dash0.com\/notification-channel-ids': CHANNEL/);
  assert.match(alert, /notification-channels\/\$\{CHANNEL\}/);
  assert.ok(channel);
});
