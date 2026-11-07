// Fast checks for tools/verify-deploy.js against a stand-in API and site.
const test = require('node:test'), assert = require('node:assert'), http = require('node:http');
const { verify } = require('../tools/verify-deploy.js');

const NEW = 'b'.repeat(40), OLD = 'a'.repeat(40);
function stub(state) { // serves /health and /version.txt from state.api / state.site; counts polls
  const srv = http.createServer((req, res) => {
    state.polls++;
    if (req.url === '/health') return res.end(JSON.stringify({ ok: true, commit: state.api }));
    if (req.url.startsWith('/version.txt')) return res.end(state.site + '\n');
    res.statusCode = 404; res.end();
  });
  return new Promise(r => srv.listen(0, () => r({ srv, url: `http://localhost:${srv.address().port}` })));
}
const run = async (state, { head = async () => NEW, ms = 2000, onWait = () => {} } = {}) => {
  const { srv, url } = await stub(state);
  try { return await verify({ sha: NEW, api: url, site: url, head, deadline: Date.now() + ms, wait: async () => { onWait(state); await new Promise(r => setTimeout(r, 10)); } }); }
  finally { srv.close(); }
};

test('passes once both the API and the site serve the commit', async () => {
  const r = await run({ api: OLD, site: OLD, polls: 0 }, { onWait: s => { if (s.polls >= 4) { s.api = NEW; s.site = NEW; } } });
  assert.ok(r.ok); assert.match(r.msg, /^live/);
});

test('fails at the deadline when one of them never updates', async () => {
  const r = await run({ api: NEW, site: OLD, polls: 0 }, { ms: 100 });
  assert.equal(r.ok, false); assert.match(r.msg, /site serves a{40}/);
});

test('passes early when the branch has moved on to a newer commit', async () => {
  const r = await run({ api: OLD, site: OLD, polls: 0 }, { head: async () => 'c'.repeat(40) });
  assert.ok(r.ok); assert.match(r.msg, /^superseded/);
});

test('an unreachable service counts as not live, not as a pass', async () => {
  const r = await verify({ sha: NEW, api: 'http://localhost:9', site: 'http://localhost:9', head: async () => NEW, deadline: Date.now() + 50, wait: async () => {} });
  assert.equal(r.ok, false); assert.match(r.msg, /error/);
});
