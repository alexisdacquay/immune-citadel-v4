# Operations

## Environments

| | Game | Save API | Deploys |
|---|---|---|---|
| Production | https://immune-citadel-v4.onrender.com | https://immune-citadel-v4-api.onrender.com | branch `main`, after CI passes |
| Dev | https://immune-citadel-v4-dev.onrender.com | https://immune-citadel-v4-api-dev.onrender.com | branch `dev`, after CI passes |
| Local | http://localhost:8080 | http://localhost:8787 | `docker compose up` |

All on Render: two static sites, two Node web services, one Postgres with one schema per environment. `GET /health` on an API returns the commit it runs, e.g. `{"ok":true,"commit":"13c5715…"}`; Render uses it as the health check, so a broken API deploy never takes traffic.

## Releases

```mermaid
flowchart LR
    B["issue branch"] --> PR["pull request into dev"]
    PR --> CI{"CI: npm test"}
    CI -- red --> B
    CI -- green --> M["merge into dev"]
    M --> CI2{"CI on dev"} -- green --> DEV["Render deploys dev"]
    DEV --> P["owner merges dev into main<br/>(the production gate)"]
    P --> CI3{"CI on main"} -- green --> PROD["Render deploys production"]
```

| Step | What | Proof |
|---|---|---|
| CI | [ci.yml](../.github/workflows/ci.yml): unit and integration tests on every pull request and every push to `dev` and `main` | PR [#30](https://github.com/alexisdacquay/immune-citadel-v4/pull/30) and [#31](https://github.com/alexisdacquay/immune-citadel-v4/pull/31) checks |
| CD to dev | Render's auto-deploy trigger "after CI checks pass" on the dev services | [#25](https://github.com/alexisdacquay/immune-citadel-v4/issues/25#issuecomment-6667755969): CI passed 19:51:17, Render started the deploy at 19:51:20, `/health` showed the commit 115 s after the merge |
| Production | the same trigger on `main`; only the owner merges `dev` into `main` | `/health` on the production API shows the commit |

**Rollback:** Render dashboard → the service → Events → Rollback on the last good deploy, or revert the change on `main` (CI, then Render, redeploy).

## Telemetry

Local only (`docker compose up`); production sends none. The key journey is the cloud save (`PUT` then `GET /api/save/:code`).

- **Traces:** every API request, with its Postgres query. Spans carry the route `/api/save/:code`, never the code; client addresses are redacted; queries show `$1`, not values.
- **Metrics:** request duration by method and status; `saves_total{outcome="ok"|"failed"}`.
- **Logs:** JSON lines, each with the `trace_id` and `span_id` of its request.
- Code: [server/otel.js](../server/otel.js) (OpenTelemetry), [server/route.js](../server/route.js) (the redaction), [server/index.js](../server/index.js) (logs and the counter). Fast tests: [server/telemetry.test.js](../server/telemetry.test.js).

To follow one save from trace to logs in Grafana (http://localhost:3000): Explore → Loki → `{service_name="immune-citadel-api"}` → open a line → copy its `trace_id` → Explore → Tempo → paste it.

| One save, traced | Its log line, same trace ID |
|---|---|
| ![trace](images/grafana-trace.png) | ![logs](images/grafana-logs.png) |

`saves_total` by outcome across the test runs of this release (each API restart starts new series at 0):

![saves_total](images/grafana-metric.png)

## Alert: cloud saves failing

[observability/alerting.yaml](../observability/alerting.yaml): fires when any save in the last 5 minutes failed with a server error, so a player's progress did not reach the cloud. Evaluated every 10 s; it clears 5 minutes after the last failure.

Try it: `docker compose stop db`, make a save in the game (or `curl -X PUT localhost:8787/api/save/ABCDEFGHJKMNPQRS -H 'content-type: application/json' -d '{"save":{}}'`), and watch Grafana → Alerting. Measured: firing 7 s after the first failed save; cleared 291 s after the database came back. Then `docker compose start db`.

The alert is sent to a webhook on this machine (`host.docker.internal:8790`), reserved for the on-call agent, which is not part of this release.

![alert](images/grafana-alert.png)
