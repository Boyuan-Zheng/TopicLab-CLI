# Portrait Staging Smoke

This document is the maintainer-facing record for the public TopicLab portrait
CLI smoke path.

## Official Preview Install Method

For the portrait preview lane, the official installation method is:

1. clone `TopicLab-CLI` from GitHub
2. checkout `preview/portrait`
3. run locally from source

Until the npm prerelease is actually published and verified, source clone is
not a fallback. It is the official install path.

Canonical public skill:

- `/skills/topiclab-portrait-cli-test-agent/SKILL.md`

## Public Staging Target

- base URL:
  - `https://u394499-8634-23d284fb.westb.seetacloud.com:8443`

Expected public routes for the minimal agent loop:

- `GET /health`
- `GET /api/v1/auth/register-config`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/portrait/sessions`
- `POST /api/v1/portrait/sessions/{session_id}/respond`
- `GET /api/v1/portrait/sessions/{session_id}`
- `GET /api/v1/portrait/sessions/{session_id}/result`

Important probe note:

- do not use `GET /api/v1/portrait/sessions` as a route-presence probe
- the current unified portrait session surface exposes `POST /api/v1/portrait/sessions`
  for create and per-session `GET` routes after a session exists
- maintainer smoke therefore probes portrait-route presence with `POST /api/v1/portrait/sessions`
  and treats any non-`404` status as "route exists"

## Smoke Script

Run from the checked-out `topiclab-cli` repo:

```bash
npm install
npm run build
npm run smoke:portrait:staging -- --probe-only
```

Full auth + session smoke:

```bash
export TOPICLAB_PORTRAIT_SMOKE_PHONE='<your_phone>'
export TOPICLAB_PORTRAIT_SMOKE_USERNAME='<your_username>'
export TOPICLAB_PORTRAIT_SMOKE_PASSWORD='<your_password>'
npm run smoke:portrait:staging
```

Optional overrides:

```bash
export TOPICLAB_PORTRAIT_STAGING_BASE_URL='https://u394499-8634-23d284fb.westb.seetacloud.com:8443'
export TOPICLAB_PORTRAIT_SMOKE_ACTOR_ID='staging-smoke-agent'
export TOPICLAB_PORTRAIT_SMOKE_TEXT_1='我是公网 smoke 测试智能体。'
export TOPICLAB_PORTRAIT_SMOKE_TEXT_2='我主要做智能体、科研工具与画像系统相关工作。'
```

Artifacts from each run are written to:

- `workspace/portrait-staging-smoke/<timestamp>/`

That folder contains:

- route probe results
- every CLI step request/response capture
- a final summary JSON
- downloaded exports, if the backend returned them

## What The Smoke Validates

`scripts/portrait-staging-smoke.mjs` validates the real public path, not a
local fake:

1. public route exposure
2. `portrait auth ensure`
3. `portrait start`
4. read the returned prompt-first `ai_memory` prompt
5. `portrait respond --external-text-file ...`
6. continue with the server-driven follow-up `portrait respond ...` steps until
   the session reaches `completed`
7. `portrait status`
8. `portrait result`
9. `portrait history`
10. `portrait export --kind profile-markdown`
11. `portrait artifacts list`
12. `portrait artifacts download` if a binary/downloadable artifact is present

If the public staging backend exposes registration routes, the same smoke can
also verify self-registration with the agent's own phone, username, and
password.

## Failure Recovery

If the smoke fails, use this triage order:

1. `404 No route for GET /api/v1/auth/register-config`
   - meaning: the public staging gateway is not serving the latest auth router
   - impact: self-registration is unavailable even though the CLI supports it
2. `404 No route for /api/v1/portrait/...`
   - meaning: the public staging gateway is not serving the latest portrait
     backend
   - impact: CLI cannot reach the cloud portrait runtime
3. `network_error`
   - meaning: DNS / TLS / upstream connectivity problem
4. `portrait_auth_error`
   - meaning: token missing, expired, or invalid; re-run `portrait auth ensure`
5. `missing_portrait_session_id`
   - meaning: local state lost the active session id; run `portrait resume` or
     `portrait start`

## 2026-04-11 Early Probe Record

The maintainer first directly probed the public staging URL and observed:

```http
GET /health
HTTP/1.1 404 Not Found

GET /api/v1/auth/register-config
HTTP/1.1 404 Not Found

GET /api/v1/portrait/sessions
HTTP/1.1 404 Not Found
```

Probe-only smoke command:

```bash
npm run smoke:portrait:staging -- --probe-only
```

Recorded output directory from this run:

- `workspace/portrait-staging-smoke/2026-04-11T08-32-20-375Z/`

Initial interpretation at that time:

- the CLI code path for register-or-login is already implemented
- the current public staging deployment is not exposing:
  - `/health`
  - `/api/v1/auth/register-config`
  - `/api/v1/portrait/sessions`
- therefore agents cannot yet self-register or start portrait sessions on this
  public URL until staging is updated

At that moment this looked like a deployment exposure issue, not a local CLI
packaging issue.

## 2026-04-11 Remote Deployment Diagnosis

The maintainer also inspected the current AutoDL server behind this staging
URL.

Observed listeners:

- public custom-service mapped port:
  - `127.0.0.1:6006`
  - process:
    - `python3 /home/gmk/tashan-world-0406/scripts/tashan-world-account-service.py`
- separate TopicLab backend process:
  - `0.0.0.0:18000`
  - process:
    - `python -m uvicorn main:app`

Observed code locations:

- TopicLab portrait staging repo:
  - `/root/topiclab-portrait-staging/topiclab-backend`
- currently exposed public account-service repo:
  - `/root/tashan-world-0406`
  - `/home/gmk/tashan-world-0406`

Observed route facts:

- `127.0.0.1:6006`
  - does **not** expose `/health`
  - does **not** expose `/api/v1/auth/register-config`
  - does **not** expose `/api/v1/portrait/sessions`
- `127.0.0.1:18000`
  - **does** expose `/health`
  - **does** expose `/api/v1/auth/register-config`
  - **does** expose older portrait dialogue routes such as:
    - `/api/v1/portrait/dialogue/sessions`
  - does **not** currently expose the unified CLI entry:
    - `/api/v1/portrait/sessions`

Initial conclusion:

1. the public AutoDL entry is currently mapped to the wrong process for portrait
   CLI testing
2. the backend process that is running separately is also not yet the latest
   unified portrait-session deployment
3. therefore the current public staging could not yet support the full
   `topiclab portrait auth ensure -> start -> respond -> status -> result`
   loop

The next deployment fix should therefore do both:

1. expose the correct TopicLab backend through the public custom-service port
2. deploy the latest backend build that includes `/api/v1/portrait/sessions`

## 2026-04-11 Deployment Repair Record

The maintainer then repaired the AutoDL staging deployment directly.

Actual fixes performed:

1. backed up the remote deployed backend directory
   - backup timestamp:
     - `20260411-163945`
2. synced the local validated `topiclab-backend` code into:
   - `/root/topiclab-portrait-staging/topiclab-backend`
   - while preserving:
     - `.env`
     - `storage/`
     - sqlite data files
3. fixed two real deployment blockers discovered during startup:
   - missing runtime dependency:
     - `openai`
   - migrated compatibility bugs:
     - circular import in `app/services/profile_helper/sessions.py`
     - missing module logger in `app/portrait/legacy_blocks/block_agent.py`
4. restarted the public custom-service listener on internal:
   - `127.0.0.1:6006`

Post-repair server facts:

- `6006` now runs:
  - `topiclab-backend`
- public health:
  - `GET /health -> 200`
- public auth preflight:
  - `GET /api/v1/auth/register-config -> 200`

This record captured the first repair attempt, but it was not the final stable
topology.

## 2026-04-11 Final Recovery Record

The final stable AutoDL staging topology on 2026-04-11 is:

- `127.0.0.1:6006`
  - process:
    - `python3 /home/gmk/tashan-world-0406/scripts/tashan-world-account-service.py`
  - role:
    - keeps the legacy `/v1/*` Tashan World access surface
    - reverse-proxies TopicLab portrait routes to `127.0.0.1:18000`
- `0.0.0.0:6008`
  - process:
    - `openclaw-gateway`
  - role:
    - existing cloud gateway, left untouched
- `0.0.0.0:18000`
  - process:
    - `python -m uvicorn main:app --host 0.0.0.0 --port 18000`
  - role:
    - actual TopicLab portrait backend

Compatibility fix performed on the same day:

1. patched `/home/gmk/tashan-world-0406/scripts/tashan-world-account-service.py`
   so the public `6006` entry now proxies:
   - `/health`
   - `/api/v1/auth/*`
   - `/api/v1/portrait/*`
   - `/api/v1/profile-helper/*`
   to `http://127.0.0.1:18000`
2. kept legacy `/v1/*` account-service routes untouched
3. left `6008` untouched

Second real blocker discovered during validation:

- `POST /api/v1/auth/register` returned `500`
- root cause from `topiclab_backend_18000.log`:
  - `sqlite3.OperationalError: attempt to write a readonly database`
- practical recovery:
  - explicitly restarted the `18000` uvicorn backend with `TOPICLAB_STAGING_PORT=18000`
  - after restart, registration and login returned `200` again

Final verified public route state after recovery:

- `GET /health -> 200`
- `GET /api/v1/auth/register-config -> 200`
- `POST /api/v1/auth/register -> 200`
- `POST /api/v1/auth/login -> 200`

Final verified CLI state after recovery:

- `topiclab portrait auth ensure`:
  - self-registration succeeded against the public staging URL
- `topiclab portrait start --mode legacy_product`:
  - returned the prompt-first `ai_memory` step
  - returned the full long-form AI memory extraction prompt
  - did not require an extra `A/B` selection step
- `npm run smoke:portrait:staging`:
  - completed successfully against the public staging URL
  - recorded output directory:
    - `workspace/portrait-staging-smoke/2026-04-11T10-47-10-977Z`
  - verified:
    - `auth ensure`
    - `start`
    - prompt-first `ai_memory` reply import
    - server-driven follow-up loop
    - `status`
    - `result`
    - `history`
    - `export --kind profile-markdown`
    - `artifacts list`

Operational pitfall discovered:

- `/root/topiclab-portrait-staging/topiclab-backend/scripts/portrait_staging_service.sh`
  defaults to port `6006`
- if maintainers use it without overriding `TOPICLAB_STAGING_PORT`, it can
  accidentally stop the `6006` compatibility shell instead of the real
  `18000` portrait backend
- for the current staging host, always manage the portrait backend with:
  - `TOPICLAB_STAGING_PORT=18000`
  - `TOPICLAB_STAGING_HOST=0.0.0.0`
  - explicit `TOPICLAB_PID_FILE`, `TOPICLAB_LOG_FILE`, and `TOPICLAB_HEALTH_URL`
- public unified portrait entry:
  - `GET /api/v1/portrait/sessions -> 401`
  - this is the expected unauthenticated response

## 2026-04-11 Successful Public Smoke

After the deployment repair, the maintainer ran:

```bash
npm run smoke:portrait:staging -- --probe-only
```

Observed result:

- exit code:
  - `0`
- output directory:
  - `workspace/portrait-staging-smoke/2026-04-11T08-45-31-375Z/`

Then the maintainer ran a full public staging smoke with a fresh self-registered
staging account:

```bash
npm run smoke:portrait:staging
```

Observed result:

- exit code:
  - `0`
- output directory:
  - `workspace/portrait-staging-smoke/2026-04-11T08-50-22-639Z/`

Validated steps for that 2026-04-11 run:

1. `portrait auth ensure`
2. `portrait start --mode legacy_product`
3. `portrait respond --choice direct`
4. `portrait respond --text ...`
5. `portrait status`
6. `portrait respond --text ...`
7. `portrait result`
8. `portrait history`
9. `portrait export --kind profile-markdown`
10. `portrait artifacts list`

Key confirmed outcomes:

- self-registration on public staging succeeded
- unified portrait session creation succeeded
- `legacy_product` direct path responded through the migrated old kernel
- the cloud runtime advanced to the next text-input question:
  - “你目前的研究阶段是什么？”
- markdown export artifact generation succeeded
- artifact listing succeeded

Current status:

- the public staging URL is now suitable for external agent testing through the
  unified `topiclab portrait ...` CLI loop

## 2026-04-11 Prompt-First Public Smoke

After the prompt-first backend and CLI fixes were deployed, the maintainer
re-ran both the public probe and the full cloud-backed prompt-first loop.

Probe-only command:

```bash
npm run smoke:portrait:staging -- --probe-only
```

Observed result:

- exit code:
  - `0`
- output directory:
  - `workspace/portrait-staging-smoke/2026-04-11T09-51-42-944Z/`
- confirmed routes:
  - `GET /health -> 200`
  - `GET /api/v1/auth/register-config -> 200`
  - `GET /api/v1/portrait/sessions -> 401`

Full smoke command:

```bash
npm run smoke:portrait:staging
```

Observed result:

- exit code:
  - `0`
- output directory:
  - `workspace/portrait-staging-smoke/2026-04-11T09-57-40-498Z/`

Validated steps for that prompt-first run:

1. `portrait auth ensure`
2. `portrait start --mode legacy_product`
3. read the returned `ai_memory` prompt
4. `portrait respond --external-text-file ./03-ai-memory-reply.md`
5. continue with server-driven follow-up `portrait respond ...` calls
6. `portrait status`
7. `portrait result`
8. `portrait history`
9. `portrait export --kind profile-markdown`
10. `portrait artifacts list`

Key confirmed outcomes:

- self-registration on public staging succeeded
- `portrait auth ensure` also succeeds on later reruns with the same account
- unified `legacy_product` start now returns the prompt-first `ai_memory`
  prompt directly
- the current CLI-using agent can answer that prompt itself and continue the
  same cloud-backed session
- the session completed successfully:
  - `session_id = pts_fed4b6c79a674904`
- profile markdown export succeeded:
  - `artifact_id = par_eed4c4fe2ccc40a2`
- artifact listing succeeded
- no downloadable binary artifact was present in this specific run, so
  `portrait artifacts download` was correctly skipped rather than faked
- direct remote DB verification on AutoDL confirmed durable records for this
  run:
  - session row:
    - `pts_fed4b6c79a674904`
  - portrait state row:
    - `pst_fb36eee9e7304d4b`
  - artifact row:
    - `par_eed4c4fe2ccc40a2`
  - session event count:
    - `14`

Current status:

- the public staging URL is now suitable for external agent testing through the
  unified prompt-first `topiclab portrait ...` loop
