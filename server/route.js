// The save code in /api/save/<code> is the player's only credential: logs and traces use this route instead of the URL.
// The path is decoded first, so no way of writing it gets a code through (#52): any path that names the save route (//api/save,
// upper case, URL-encoded slashes) becomes the route, and any 16-character run of the code's alphabet left anywhere else is hidden.
module.exports = url => {
  let p = (url || '').split('?')[0];
  try { p = decodeURIComponent(p); } catch { /* malformed encoding: redact the raw text */ }
  if (/\/api\/save\//i.test(p)) return '/api/save/:code';
  return p.replace(/[A-HJ-NP-Z2-9]{16}/gi, ':code');
};
