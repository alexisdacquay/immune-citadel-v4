// OpenTelemetry for the save API: traces, metrics and logs, sent over OTLP to OTEL_EXPORTER_OTLP_ENDPOINT.
// Loaded with `node --require ./otel.js index.js` (Dockerfile); without the endpoint it does nothing.
// The save code is the player's only credential: spans get the route (/api/save/:code), never the code,
// and no client address. Metrics carry method and status only; pg spans hold the query text with $1, not values.
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
  const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');
  const { PinoInstrumentation } = require('@opentelemetry/instrumentation-pino');
  const route = url => (url || '').split('?')[0].replace(/^\/api\/save\/.*/, '/api/save/:code');
  const sdk = new NodeSDK({
    instrumentations: [
      new HttpInstrumentation({
        startIncomingSpanHook: req => ({ 'url.path': route(req.url), 'http.route': route(req.url), 'client.address': 'redacted', 'network.peer.address': 'redacted' }),
      }),
      new PgInstrumentation(),
      new PinoInstrumentation(), // stamps trace_id/span_id on every log line and ships it over OTLP
    ],
  });
  sdk.start();
  process.on('SIGTERM', () => sdk.shutdown().finally(() => process.exit(0)));
}
