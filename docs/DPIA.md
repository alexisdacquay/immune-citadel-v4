# Data protection impact assessment

Status: **signed by the owner on 2026-11-07**, **re-signed the same day** for the save and load request records that now reach Sentry (rows marked *new*), and **re-signed on 2026-11-08** for three facts that changed (rows marked *2026-11-08*): gameplay events are live in production since 2026-11-07, each environment (production, dev) has its own database, and the game's fonts come from its own site instead of Google (sign-off below). Rows and lines marked *(2026-11-08, awaiting the owner's signature)* match the changes of 2026-11-08 (automatic cloud saves deleted after 13 months unused, a public contact route, performance traces that follow the stats switch, processors, backups, Render's logs, the on-call agent) and are **not signed yet**. Headings follow the ICO template ([Children's Code, standard 2](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/2-data-protection-impact-assessments/)). Review it when anything that leaves the browser changes.

## The service

| | |
|---|---|
| What | Immune Citadel: a free browser game that teaches immunology |
| Players | children aged 12-15; no accounts, no names, no ads, no chat |
| Controller | the owner |
| Contact *(2026-11-08, awaiting the owner's signature)* | questions: a public [GitHub issue](https://github.com/alexisdacquay/immune-citadel-v4/issues) in the game's repository; no response time is promised; never post the save code there, because anyone can read it. A save cannot be deleted on request: the code is its only key, so without it nobody can find the save (GDPR Art 11: we do not collect more data only to identify a player). An unused save is deleted after 13 months; the "Your data" notice says this |
| Processors *(2026-11-08, awaiting the owner's signature)* | Render (hosting, the save API, Postgres and its backups; Frankfurt) and Sentry (crash reports and the save API's records; EU, Frankfurt), both under their standard terms. Recipients of no personal data, by design: GitHub (a public issue holding an error's name, message and stack trace) and DeepSeek (an API outside the EU, sent that error and our source code by the on-call agent) |

## Data flows

![Data flows: the player's browser makes a cloud save automatically and sends anonymous gameplay events to the save API and Postgres (Render, Frankfurt, with backups); unused saves are deleted after 13 months. Crash reports go to Sentry EU (Frankfurt), page-load speed only while play stats are on; the save API sends errors, traces, log lines and a metric. A Sentry alert opens a public GitHub issue with the error's name, message and stack trace, and an on-call agent sends that error and the relevant source code to DeepSeek to draft a fix; none of it carries personal data](diagrams/dpia-data-flow.svg)

| Data | Purpose | Where | Kept | Identifies a child? |
|---|---|---|---|---|
| *(2026-11-08, awaiting the owner's signature)* save (stars, settings, cards seen) under a save code, made automatically: the first time the game saves to the cloud it mints the code, with no button press | keep progress safe and continue on another device | Postgres (Render, Frankfurt) | deleted after 13 months unused (not updated) (a load alone does not count as use; there is no deletion on request, see Contact) | no name; the code is a credential, never logged by our code or sent to Sentry |
| gameplay events ([EVENTS.md](EVENTS.md)) | make levels fairer, cards clearer | Postgres | 13 months, deleted automatically | no: random id per page load, date only, fixed values |
| *(2026-11-08, awaiting the owner's signature)* crash reports, load speed (performance traces) | fix bugs | Sentry (processor, EU) | 30 days on the free plan, 90 on paid plans ([Sentry](https://docs.sentry.io/security-legal-pii/security/data-retention-periods/)) | no: IP not stored, location removed, save codes scrubbed, no replay. The game sends no page-load traces when play stats are off or Global Privacy Control is on; crash reports still go. The save API's records of each save and load (next row) do not follow the switch |
| *new*, *(2026-11-08, awaiting the owner's signature)* save and load request records: method, route (code replaced), status, duration, trace ID | see whether saves work and how fast; sent for every save and load, whatever the stats switch or Global Privacy Control, because they carry nothing about the player | Sentry (processor, EU); the save API's own log line in Render's app logs | Sentry 30 days on the free plan; Render's log retention | no: no IP, no browser identifier (user agent), no save code or content; tested ([server/observability.test.js](../server/observability.test.js)). Render keeps no HTTP request logs on this workspace (checked 2026-11-08: only app and build logs), so the save code in the URL reaches no Render log; our own log line hides it however the path is written ([#102](https://github.com/alexisdacquay/immune-citadel-v4/issues/102), PR #121) |
| IP address | rate limiting | save API memory only | forgotten within two minutes; never written or logged by our code (Render's edge may log it under its own policy) | used, not stored |
| *(2026-11-08, awaiting the owner's signature)* backups and point-in-time recovery of both databases | restore after a failure | Render (processor, Frankfurt) | Render's recovery window | as the rows above; a deleted save or pruned event stays in them until the window passes |
| *(2026-11-08, awaiting the owner's signature)* error name, message and stack trace of a Sentry issue | wake the on-call agent and fix the bug | a GitHub issue in the public repository, opened by a Sentry alert; DeepSeek, which gets that error and the relevant source code from the on-call agent to draft a fix | the issue until deleted; DeepSeek under its API terms | no: no personal data (save codes are scrubbed before Sentry stores the error) |
| on/off choices (sound, difficulty in the save; stats under its own key, never uploaded) | remember the player's settings | the browser (localStorage) | until the player clears it | no |

## Lawful basis

| Processing | Basis | Why |
|---|---|---|
| *(2026-11-08, awaiting the owner's signature)* saves | legitimate interests | made automatically so progress is never lost and the code works on another device; no name, nothing else stored, deleted after 13 months unused, and the "Your data" notice says so |
| gameplay events, crash reports | legitimate interests | small, anonymous, first-party; no profiling, no ads; children's interests weighed below |
| reading and sending from the browser (ePrivacy Art 5(3)) | UK: statistical-purposes exception ([DUAA 2025 s.112](https://www.legislation.gov.uk/ukpga/2025/18/section/112)); FR: [CNIL audience-measurement exemption](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies-solutions-pour-les-outils-de-mesure-daudience) | both need a notice and an easy way to object: the "Your data" popover and the stats switch |

**Balancing test (children first):** the benefit is a fairer, clearer learning game. The risk to a child is being singled out from their play, which is close to none: no id survives a reload, no time of day, no IP, no free text, no third party sees play. A child (or parent) turns stats off with two taps: the shield on the title screen, then the switch. A browser's Global Privacy Control signal turns them off.

## Default setting: stats on

| Option | Result | Decision |
|---|---|---|
| on, with notice and switch | data from most players; meets the UK and FR exemptions | **chosen by the owner, 2026-11-06** |
| *(2026-11-08, awaiting the owner's signature)* off until the player opts in | a child consents alone to online services only from 13 in the UK (UK GDPR Art 8, DPA 2018 s.9), 15 in France and 16 in Germany: many players could not, and opt-in gives too few answers to be useful. The basis stays legitimate interests, not consent; the switch and Global Privacy Control are the safeguard | rejected |

## Risks and measures

| Risk | Measure | Residual |
|---|---|---|
| a sitting linked to a known child (e.g. a teacher watching a class) | date only, no time; page id dies with the page | low |
| free text or identifiers smuggled into the table | server accepts only fixed values and formats ([server/play.js](../server/play.js)) | low |
| the events table fills its database disk and takes saves down | 20 events a request, 2,000 rows a day per server, 13-month deletion; *2026-11-08* each environment has its own database, so dev cannot fill production's | low |
| play data seen by a third party | `/api/play` excluded from Sentry in the browser and the server; tested | low |
| *2026-11-08* loading the game tells another company the child's IP address and browser identifier | fonts served by the game's own site (Google Fonts removed, [#99](https://github.com/alexisdacquay/immune-citadel-v4/issues/99)); the only other company the browser contacts is Sentry: its script comes from Sentry's CDN (run by Fastly, worldwide) and its reports go to Sentry in the EU; both see the IP address and browser identifier in transit, Sentry is set never to store the IP, and the game removes the browser identifier from what it sends | low |
| *new* a child's device recognised by its browser identifier (user agent) in Sentry | removed by the server before anything leaves, in errors, traces, logs and metrics; tested | low |
| strict member states (e.g. DE) do not accept the exemptions | stats switch and GPC honoured | medium, accepted by the owner |
| *(2026-11-08, awaiting the owner's signature)* saves kept with no end | deleted after 13 months unused, with the gameplay events' daily prune | low |
| *(2026-11-08, awaiting the owner's signature)* a child posts their save code in the public contact issue | the contact route says never to post it | low |
| *(2026-11-08, awaiting the owner's signature)* a player cannot delete their cloud save before it expires | the save holds game progress only, under a random code with no name; it is deleted after 13 months unused; a delete button in the game is the way to offer it later | low |
| *(2026-11-08, awaiting the owner's signature)* an error in a public GitHub issue, or sent to DeepSeek, carries a child's data | only the error's name, message and stack trace and our source code go there; save codes are scrubbed before Sentry stores an error, and Sentry stores no IP | low |

## Sign-off

| Role | Name | Date |
|---|---|---|
| owner | Alexis Dacquay | 2026-11-07 |
| owner, re-signing for the *new* rows | Alexis Dacquay | 2026-11-07 |
| owner, re-signing for the *2026-11-08* rows | Alexis Dacquay | 2026-11-08 |
| owner, signing the rows marked *(2026-11-08, awaiting the owner's signature)* | | awaiting the owner's signature |
