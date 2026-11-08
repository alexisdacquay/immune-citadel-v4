// Fast checks that the pieces are wired to each other: game -> API -> Compose -> Sentry -> alert.
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

test('the API starts the same way everywhere, and Compose takes the Sentry DSN from .env only', () => {
  assert.equal(JSON.parse(read('server/package.json')).scripts.start, 'node index.js');
  assert.match(read('server/Dockerfile'), /CMD \["npm", "start"\]/);
  assert.equal(read('render.yaml').match(/startCommand: cd server && exec npm start/g).length, 2, 'exec, so a deploy\'s SIGTERM reaches the API and not only a shell');
  assert.match(compose, /SENTRY_DSN: \$\{SENTRY_DSN:-\}/);
  assert.doesNotMatch(compose + read('.env.example'), /ingest\.[a-z.]*sentry\.io/, 'no real DSN in tracked files');
  assert.match(read('.gitignore'), /^\.env$/m);
});

test('the alert emails the owner on every save API error', () => {
  const alert = JSON.parse(read('observability/sentry-alert.json'));
  assert.deepEqual(alert.projectSlugs, ['immune-citadel-api']);
  assert.equal(alert.triggers.conditions[0].type, 'every_event');
  assert.equal(alert.actionFilters[0].actions[0].type, 'email');
  const game = JSON.parse(read('observability/sentry-game-alert.json'));
  assert.deepEqual(game.projectSlugs, ['immune-citadel-game'], 'game errors email too');
  assert.equal(game.actionFilters[0].actions[0].type, 'email');
});

test('the game loads Sentry only on the dev and production sites, pinned and checked, with save codes scrubbed', () => {
  const html = read('index.html'), block = html.slice(html.indexOf('// Sentry: game crashes'), html.indexOf('</head>'));
  assert.match(block, /\{ 'immune-citadel-v4\.onrender\.com': 'production', 'immune-citadel-v4-dev\.onrender\.com': 'dev' \}\[location\.hostname\];\n\s*if \(!env\) return;/);
  assert.match(block, /browser\.sentry-cdn\.com\/\d+\.\d+\.\d+\//, 'a pinned SDK version');
  assert.match(block, /integrity = 'sha384-/, 'subresource integrity');
  assert.match(block, /beforeSend: scrub, beforeSendSpan: scrub, beforeBreadcrumb: b => \(\/\\\/api\\\/play\/\.test\(JSON\.stringify\(b\.data \|\| \{\}\)\) \? null : scrub\(b\)\)/);
  assert.match(block, /shouldCreateSpanForRequest: u => !u\.includes\('\/api\/play'\)/, 'gameplay events never reach Sentry');
  assert.doesNotMatch(block, /replayIntegration/, 'no session replay');
});

test('the game takes its fonts from its own site, never from Google, and both sites publish them (#99)', () => {
  const html = read('index.html'), files = [...html.matchAll(/src:url\((fonts\/[\w-]+\.woff2)\)/g)].map(m => m[1]);
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/, 'Google would get the player\'s IP and browser identifier');
  assert.ok(files.length >= 2, 'self-hosted font faces');
  for (const f of files) assert.ok(fs.existsSync(path.join(__dirname, '..', f)), `${f} is missing`);
  assert.equal(read('render.yaml').match(/cp -r fonts public\//g).length, 2, 'both static sites publish fonts/');
  assert.match(compose, /\.\/fonts:\/usr\/share\/nginx\/html\/fonts/, 'Compose serves fonts/ too');
});
