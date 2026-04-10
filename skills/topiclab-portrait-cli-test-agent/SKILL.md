---
name: topiclab-portrait-cli-test-agent
description: Use this when an agent only needs the TopicLab-CLI repository to locally bootstrap the portrait preview runtime, authenticate with its own staging account, continuously use `topiclab portrait ...` against the cloud backend, and validate cloud-returned exports including PDF/image artifact download.
---

# TopicLab Portrait CLI Test Agent

This is the single canonical skill for external agents testing the new
TopicLab portrait product through local `topiclab-cli` against the cloud
staging runtime.

If you only clone one repository for portrait testing, clone `TopicLab-CLI`
and read this file.

## Trigger

Use this skill when the task is to:

- clone only the CLI-related repository
- locally build and bootstrap the portrait preview CLI
- log in with a staging or test account
- continuously use `topiclab portrait ...` instead of the web UI
- validate the cloud-backed portrait loop
- verify portrait export, including cloud-returned PDF or image files

## Single Source Rule

Do not require the testing agent to read extra portrait CLI docs first.

If the local path is unavailable, use the GitHub preview copy of this same
file:

- `https://github.com/Boyuan-Zheng/TopicLab-CLI/blob/preview/portrait/skills/topiclab-portrait-cli-test-agent/SKILL.md`

## Core Mental Model

The installation is local, but the runtime is cloud-backed.

- local machine:
  - git clone
  - `npm install`
  - `npm run build`
  - `TOPICLAB_CLI_HOME`
  - local output files such as downloaded PDF or PNG
- cloud staging runtime:
  - auth account
  - portrait sessions
  - portrait state
  - execution logs
  - persisted portrait artifacts

That means:

- `topiclab portrait ...` is a continuous CLI interaction loop
- do not stop after one command succeeds
- keep using the same shell or the same `TOPICLAB_CLI_HOME`

## Current Runtime Target

Validated staging base URL:

- `https://u394499-8634-23d284fb.westb.seetacloud.com:8443`

Current account type:

- staging or test account
- not production

## Fastest Working Path

If you want the shortest path that works today, do exactly this:

```bash
git clone --branch preview/portrait https://github.com/Boyuan-Zheng/TopicLab-CLI.git
cd TopicLab-CLI
npm install
npm run portrait:preview:bootstrap
source ./.topiclab-cli-home/portrait-preview.env
node dist/cli.js portrait auth ensure --phone <your_phone> --username <your_username> --password '<your_password>' --json
node dist/cli.js portrait start --mode legacy_product --actor-type internal --actor-id <your_agent_id> --json
node dist/cli.js portrait respond --choice direct --json
node dist/cli.js portrait respond --text "我是测试智能体 Alpha。" --json
node dist/cli.js portrait status --json
node dist/cli.js portrait respond --text "我目前主要做 AI agent 与科研工具开发。" --json
node dist/cli.js portrait result --json
```

Use this GitHub source-install path until the npm prerelease is actually
published and confirmed available.

Pinned preview refs:

- TopicLab-CLI source tag:
  - `topiclab-cli-v0.4.0-portrait.2`

## If You Cloned The Main TopicLab Repo

If you cloned `Tashan-TopicLab` first and found a pointer to this skill through
the main repo README, initialize the `topiclab-cli` submodule and then use this
same file inside that checkout:

```bash
git clone --branch preview/portrait https://github.com/Boyuan-Zheng/Tashan-TopicLab.git
cd Tashan-TopicLab
git submodule update --init topiclab-cli
cd topiclab-cli
npm install
npm run portrait:preview:bootstrap
source ./.topiclab-cli-home/portrait-preview.env
```

After that, continue with the same login and portrait commands documented in
this skill.

## Install And Bootstrap Rule

Preferred path:

1. clone the preview branch from GitHub
2. install dependencies locally
3. run the preview bootstrap
4. source the generated env file
5. log in with a staging account
6. keep using the CLI continuously against the cloud staging backend

Recommended commands:

```bash
git clone --branch preview/portrait https://github.com/Boyuan-Zheng/TopicLab-CLI.git
cd TopicLab-CLI
npm install
npm run portrait:preview:bootstrap
source ./.topiclab-cli-home/portrait-preview.env
```

Manual build path if needed:

```bash
cd /absolute/path/to/TopicLab-CLI
npm install
npm run build
export TOPICLAB_CLI_HOME=/tmp/topiclab-cli-portrait-user
export TOPICLAB_BASE_URL=https://u394499-8634-23d284fb.westb.seetacloud.com:8443
```

Potential future npm path after actual publish:

```bash
npm install -g topiclab-cli@portrait --registry=https://registry.npmmirror.com
topiclab portrait auth ensure --base-url https://u394499-8634-23d284fb.westb.seetacloud.com:8443 --phone <your_phone> --username <your_username> --password '<your_password>' --json
```

Until that prerelease really exists, prefer the GitHub source-install path.

## Login Rule

Use a staging or test account, not a production account.

Treat `portrait auth ensure` as the register-or-login command. If it succeeds,
continue immediately with `start` and `respond`.

Canonical login command:

```bash
node dist/cli.js portrait auth ensure \
  --phone <your_phone> \
  --username <your_username> \
  --password '<your_password>' \
  --json
```

## Unified Command Surface

Prefer the unified portrait session surface.

Main loop:

1. `topiclab portrait auth ensure`
2. `topiclab portrait start`
3. `topiclab portrait respond`
4. `topiclab portrait status`
5. `topiclab portrait result`

Session-control commands:

- `topiclab portrait resume`
- `topiclab portrait history`
- `topiclab portrait reset`
- `topiclab portrait export`
- `topiclab portrait artifacts list`
- `topiclab portrait artifacts get`
- `topiclab portrait artifacts download`

Only use lower-level commands when explicitly debugging:

- `topiclab scales ...`
- `topiclab portrait dialogue ...`
- `topiclab portrait state ...`

## Continuous Use Rule

After login, continue using the same CLI environment.

Important facts:

- local CLI state is stored in `TOPICLAB_CLI_HOME/state.json`
- the current portrait session id is remembered there
- the real conversation and portrait state live on the cloud staging backend

Minimum continuous interaction pattern:

```bash
node dist/cli.js portrait start --mode legacy_product --actor-type internal --actor-id <your_agent_id> --json
node dist/cli.js portrait respond --choice direct --json
node dist/cli.js portrait respond --text "我是测试智能体 Alpha。" --json
node dist/cli.js portrait status --json
node dist/cli.js portrait respond --text "我目前主要做 AI agent 与科研工具开发。" --json
node dist/cli.js portrait result --json
```

If the agent pauses and later comes back:

```bash
source ./.topiclab-cli-home/portrait-preview.env
node dist/cli.js portrait resume --json
node dist/cli.js portrait status --json
```

## Input Rule For `respond`

Use exactly one input family per call:

- `--choice`
- `--text` or `--text-file`
- `--external-text` or `--external-text-file`
- `--external-json` or `--external-json-file`
- `--confirm`

Do not make the agent choose backend runtime slices manually unless the task is
explicitly about debugging.

## Minimum Test Flow

Run at least this closure:

1. login with a staging account
2. `portrait start --mode legacy_product`
3. `portrait respond --choice direct`
4. `portrait respond --text ...`
5. `portrait status`
6. `portrait result`

If asked to do a fuller validation, also test:

7. one or more additional `portrait respond --text ...` calls
8. `portrait resume`
9. `portrait history`
10. `portrait export`
11. `portrait reset`

If binary export is part of the task, also validate:

12. `topiclab portrait export --kind profile-pdf --json`
13. `topiclab portrait export --kind profile-image --json`
14. `topiclab portrait artifacts list --json`
15. `topiclab portrait artifacts download <artifact_id> --json`

## Binary Export Rule

The portrait product is not limited to markdown exports.

The current AutoDL staging runtime has already been validated for cloud-returned
binary exports. Agents should also be able to get:

- PDF:
  - `topiclab portrait export --kind profile-pdf --json`
- image:
  - `topiclab portrait export --kind profile-image --json`

What happens:

- the cloud backend renders the file
- the local CLI downloads the binary bytes
- the CLI writes the file to a local output path
- the backend also records a durable artifact entry on the cloud server

Validated cloud facts:

- runtime base URL:
  - `https://u394499-8634-23d284fb.westb.seetacloud.com:8443`
- binary artifacts are durably stored on the server under:
  - `topiclab-backend/storage/portrait_artifacts/`
- the backend exposes a later re-download route:
  - `GET /api/v1/portrait/artifacts/{artifact_id}/download`

After that, the agent can inspect or re-download the same artifact later:

```bash
node dist/cli.js portrait artifacts list --json
node dist/cli.js portrait artifacts get <artifact_id> --json
node dist/cli.js portrait artifacts download <artifact_id> --json
```

If `profile-pdf` or `profile-image` fails with a `503` style runtime error,
inspect these first:

- whether the backend restart script resolved the correct Python runtime
- whether the export runtime selected a real browser binary instead of a dummy
  `chromium-browser` wrapper

## Reporting Rule

Report back with:

1. whether clone, install, and bootstrap succeeded
2. whether login or register succeeded
3. which portrait commands were executed in sequence
4. whether continuous CLI interaction worked across multiple commands
5. whether the cloud staging runtime returned valid results
6. exact failures, if any
7. if binary export was tested, whether PDF or image files were returned and
   whether artifact re-download worked

## Ready-To-Forward Prompt

If you want to hand this task to another agent, send only the text below
together with the path or URL of this skill:

```text
请作为 TopicLab Portrait CLI 测试智能体，阅读这份唯一 skill 并严格按它执行：

/absolute/path/to/TopicLab-CLI/skills/topiclab-portrait-cli-test-agent/SKILL.md

如果本地路径不可用，就读：
https://github.com/Boyuan-Zheng/TopicLab-CLI/blob/preview/portrait/skills/topiclab-portrait-cli-test-agent/SKILL.md

你的目标是：
1. 通过网络下载或进入已有的 TopicLab-CLI preview/portrait 分支
2. 在本地安装并 bootstrap CLI
3. 用你自己的 staging/test 账号执行 portrait auth ensure
4. 连续执行 topiclab portrait start / respond / status / result
5. 必要时继续执行 resume / history / export / reset
6. 如果产品要求包含文件导出，就继续验证 profile-pdf / profile-image / artifacts download
7. 汇报是否证明了“本地 CLI -> 云端 staging”闭环可用

注意：
- 不要默认使用生产账号
- 不要把 CLI 当成一次性命令
- 除非主入口失败，不要优先使用底层调试命令
```
