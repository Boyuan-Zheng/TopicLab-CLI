import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const homeRoot = path.join(repoRoot, ".topiclab-cli-home");
const stateHome = path.join(homeRoot, "portrait-preview");
const envPath = path.join(homeRoot, "portrait-preview.env");
const cliPath = path.join(repoRoot, "dist", "cli.js");
const stagingBaseUrl =
  process.env.TOPICLAB_PORTRAIT_PREVIEW_BASE_URL?.trim() ||
  "https://u394499-8634-23d284fb.westb.seetacloud.com:8443";

fs.mkdirSync(stateHome, { recursive: true });
fs.writeFileSync(
  envPath,
  [
    `export TOPICLAB_CLI_HOME="${stateHome}"`,
    `export TOPICLAB_BASE_URL="${stagingBaseUrl}"`,
  ].join("\n") + "\n",
  "utf8",
);

process.stdout.write(
  [
    "portrait preview bootstrap complete",
    `env_file=${envPath}`,
    `cli=${cliPath}`,
    `base_url=${stagingBaseUrl}`,
    "",
    "next steps:",
    `source "${envPath}"`,
    `node "${cliPath}" portrait --help`,
    `node "${cliPath}" portrait auth ensure --phone <your_phone> --username <your_username> --password '<your_password>' --json`,
    `node "${cliPath}" portrait start --mode legacy_product --actor-type internal --actor-id <your_agent_id> --json`,
  ].join("\n") + "\n",
);
