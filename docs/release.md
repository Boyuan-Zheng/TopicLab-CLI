# Release

## Stable release

1. Bump version in `package.json`
2. Run `npm run build`
3. Run `npm test`
4. Publish with `npm publish`
5. Publish to the official npm registry; users in China should install via
   `npmmirror`

## Portrait preview release

Use this lane when the portrait CLI surface should be tested broadly without
changing the stable `latest` users.

Recommended version shape:

- `0.4.0-portrait.1`
- `0.4.0-portrait.2`

Recommended npm dist-tag:

- `portrait`

Recommended Git branch:

- `preview/portrait`

Recommended release steps:

```bash
git checkout preview/portrait
npm version 0.4.0-portrait.1 --no-git-tag-version
npm run build
npm test
npm publish --tag portrait
```

2026-04-11 preview verification on the maintainer machine:

- `npm run build`
- `npm test`
- `npm publish --tag portrait --dry-run`
- `npm pack`
- `npm install -g ./topiclab-cli-0.4.0-portrait.1.tgz --prefix /tmp/topiclab-cli-preview-install`
- `/tmp/topiclab-cli-preview-install/bin/topiclab --help`

Observed result:

- the preview tarball was produced successfully
- the package could be installed into a clean temporary prefix
- the installed global command `topiclab` executed successfully
- actual public publish is still blocked until the maintainer logs in to npm on
  the publishing machine

After publish, verify:

```bash
npm view topiclab-cli dist-tags
npm view topiclab-cli versions --json
```

Expected result:

- `latest` still points to the stable line
- `portrait` points to the new prerelease

Recommended install commands for testers:

```bash
npm install -g topiclab-cli@portrait --registry=https://registry.npmmirror.com
```

Or pin an exact preview version:

```bash
npm install -g topiclab-cli@0.4.0-portrait.1 --registry=https://registry.npmmirror.com
```

Until the preview package is actually published and verified, the official
preview install path is the source-clone workflow documented in:

- `../skills/topiclab-portrait-cli-test-agent/SKILL.md`
- `./portrait-staging-smoke.md`

Current verified public-preview facts on `2026-04-11`:

- official clone branch:
  - `preview/portrait`
- official tester repo:
  - `https://github.com/Boyuan-Zheng/TopicLab-CLI`
- canonical public agent manual:
  - `https://github.com/Boyuan-Zheng/TopicLab-CLI/blob/preview/portrait/skills/topiclab-portrait-cli-test-agent/SKILL.md`
- validated staging URL:
  - `https://u394499-8634-23d284fb.westb.seetacloud.com:8443`
- latest successful full public smoke output:
  - `workspace/portrait-staging-smoke/2026-04-11T09-57-40-498Z/`

Current publish-state fact:

- actual npm publish was not executed from this machine because:
  - `npm whoami -> ENEEDAUTH`
- therefore GitHub source clone on `preview/portrait` remains the only official
  install path until a maintainer logs in to npm and publishes the prerelease
