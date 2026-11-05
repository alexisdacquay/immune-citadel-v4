// The save code in /api/save/<code> is the player's only credential: logs and traces use this route instead of the URL.
module.exports = url => (url || '').split('?')[0].replace(/^\/api\/save\/.*/, '/api/save/:code');
