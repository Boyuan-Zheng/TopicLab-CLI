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

If the preview package has not yet been published, testers should fall back to
the source-install path documented in:

- `../../docs/cognition-portrait/portrait-cli-agent-manual.md`
- `../../docs/cognition-portrait/portrait-preview-release-plan.md`
