import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "dist", "cli.js");
const baseUrl =
  process.env.TOPICLAB_PORTRAIT_STAGING_BASE_URL?.trim() ||
  "https://u394499-8634-23d284fb.westb.seetacloud.com:8443";
const phone = process.env.TOPICLAB_PORTRAIT_SMOKE_PHONE?.trim() || "";
const username = process.env.TOPICLAB_PORTRAIT_SMOKE_USERNAME?.trim() || "";
const password = process.env.TOPICLAB_PORTRAIT_SMOKE_PASSWORD?.trim() || "";
const actorId = process.env.TOPICLAB_PORTRAIT_SMOKE_ACTOR_ID?.trim() || "staging-smoke-agent";
const aiMemoryReply =
  process.env.TOPICLAB_PORTRAIT_SMOKE_AI_MEMORY_REPLY?.trim() ||
  [
    "A1: 博士生",
    "A2: 认知科学；计算神经科学；交叉 AI 与脑科学",
    "A3: 计算建模",
    "A4: 中国科学院国家天文台",
    "A5: 导师刘老师，团队做黑洞与致密天体。",
    "A6: 合作以实验室内部和跨机构合作为主。",
    "C1: 论文写作、数据分析、组会沟通",
    "C2: 最大卡点是如何把模型结果组织成更有说服力的故事线。",
    "C3: 写作发表突破",
  ].join("\n");
const probeOnly = process.argv.includes("--probe-only");

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputRoot = path.resolve(repoRoot, "workspace", "portrait-staging-smoke", timestamp);
const cliHome = path.join(outputRoot, "cli-home");
fs.mkdirSync(outputRoot, { recursive: true });
fs.mkdirSync(cliHome, { recursive: true });

function writeJson(name, payload) {
  fs.writeFileSync(path.join(outputRoot, name), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeText(name, content) {
  const absolutePath = path.join(outputRoot, name);
  fs.writeFileSync(absolutePath, `${content}\n`, "utf8");
  return absolutePath;
}

function log(line) {
  process.stdout.write(`${line}\n`);
}

async function probeRoute(requestPath, options = {}) {
  const url = new URL(requestPath, baseUrl);
  let response;
  let rawText = "";
  try {
    response = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers || { Accept: "application/json" },
      body: options.body,
    });
    rawText = await response.text();
  } catch (error) {
    return {
      ok: false,
      request_path: requestPath,
      url: url.toString(),
      network_error: error instanceof Error ? error.message : String(error),
    };
  }

  let body = rawText;
  if (rawText) {
    try {
      body = JSON.parse(rawText);
    } catch {
      body = rawText;
    }
  }

  return {
    ok: response.ok,
    request_path: requestPath,
    url: url.toString(),
    status: response.status,
    status_text: response.statusText,
    body,
  };
}

function runCli(stepName, args) {
  const env = {
    ...process.env,
    TOPICLAB_BASE_URL: baseUrl,
    TOPICLAB_CLI_HOME: cliHome,
  };
  const stdoutPath = path.join(outputRoot, `${stepName}.stdout.txt`);
  const stderrPath = path.join(outputRoot, `${stepName}.stderr.txt`);
  const stdoutFd = fs.openSync(stdoutPath, "w");
  const stderrFd = fs.openSync(stderrPath, "w");
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", stdoutFd, stderrFd],
  });
  fs.closeSync(stdoutFd);
  fs.closeSync(stderrFd);
  const stdout = fs.existsSync(stdoutPath) ? fs.readFileSync(stdoutPath, "utf8") : "";
  const stderr = fs.existsSync(stderrPath) ? fs.readFileSync(stderrPath, "utf8") : "";
  let parsed = null;
  if (stdout.trim()) {
    try {
      parsed = JSON.parse(stdout.trim());
    } catch {
      parsed = null;
    }
  }
  const payload = {
    step: stepName,
    command: `node dist/cli.js ${args.join(" ")}`,
    exit_code: result.status ?? 1,
    stdout,
    stderr,
    json: parsed,
  };
  writeJson(`${stepName}.json`, payload);
  return payload;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function currentPolicyStep(payload) {
  const policy = asObject(payload?.policy);
  const stepId = policy && typeof policy.step_id === "string" ? policy.step_id.trim() : "";
  return stepId || null;
}

function currentInteractiveBlock(payload) {
  return asObject(payload?.interactive_block);
}

function currentSessionStatus(payload) {
  const topLevelStatus = payload?.status;
  if (typeof topLevelStatus === "string" && topLevelStatus.trim()) {
    return topLevelStatus.trim();
  }
  const nestedStatus = payload?.session?.status;
  return typeof nestedStatus === "string" && nestedStatus.trim() ? nestedStatus.trim() : null;
}

function extractAiMemoryPrompt(payload) {
  for (const block of payload?.blocks || []) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const title = typeof block.title === "string" ? block.title : "";
    const content = typeof block.content === "string" ? block.content : "";
    if (title.includes("AI 记忆提取提示词") && content.trim()) {
      return content.trim();
    }
  }
  const promptText = payload?.payload?.prompt_text;
  return typeof promptText === "string" && promptText.trim() ? promptText.trim() : "";
}

function nextFollowupArgs(payload, roundIndex) {
  const interactive = currentInteractiveBlock(payload);
  const stepId = currentPolicyStep(payload);
  if (!interactive) {
    return null;
  }

  const blockType = typeof interactive.type === "string" ? interactive.type : "";
  const blockId = typeof interactive.id === "string" ? interactive.id : "";

  if (blockId === "ai_memory_reply" || stepId === "ai_memory_reply") {
    const answerPath = writeText("03-ai-memory-reply.md", aiMemoryReply);
    return {
      stepName: "03-respond-ai-memory-reply",
      args: ["portrait", "respond", "--external-text-file", answerPath, "--json"],
    };
  }

  if (blockType === "rating") {
    return {
      stepName: `followup-${String(roundIndex).padStart(2, "0")}-rating`,
      args: ["portrait", "respond", "--choice", "4", "--json"],
    };
  }

  if (blockType === "choice") {
    const options = Array.isArray(interactive.options) ? interactive.options : [];
    const preferredChoices = [
      "confirm_review",
      "博士生",
      "计算建模",
      "疲惫",
      "方法支持",
      "写作发表突破",
      "direct",
    ];
    const preferred = preferredChoices
      .map((choice) => options.find((item) => String(item?.id || "") === choice))
      .find(Boolean);
    const chosen = preferred || options[0];
    if (!chosen) {
      return null;
    }
    return {
      stepName: `followup-${String(roundIndex).padStart(2, "0")}-choice`,
      args: ["portrait", "respond", "--choice", String(chosen.id), "--json"],
    };
  }

  if (blockType === "text_input" || blockType === "text") {
    const textByStepId = {
      basic_primary_secondary_fields: "认知科学；计算神经科学；交叉 AI 与脑科学",
      basic_institution: "中国科学院国家天文台",
      basic_advisor_team: "导师刘老师，团队做黑洞与致密天体。",
      basic_academic_network: "合作以实验室内部和跨机构合作为主。",
      capability_tech_stack: "Python（熟练）、PyTorch（日常使用）、MATLAB（入门）",
      capability_outputs: "跳过",
      needs_time_occupation: "论文写作、数据分析、组会沟通",
      needs_pain_points: "最大卡点是如何把模型结果组织成更有说服力的故事线。",
    };
    const value = textByStepId[stepId || blockId] || "跳过";
    return {
      stepName: `followup-${String(roundIndex).padStart(2, "0")}-text`,
      args: ["portrait", "respond", "--text", value, "--json"],
    };
  }

  return null;
}

async function main() {
  if (!fs.existsSync(cliPath)) {
    throw new Error(`Missing built CLI at ${cliPath}. Run npm run build first.`);
  }

  const manifest = {
    base_url: baseUrl,
    output_root: outputRoot,
    cli_home: cliHome,
    probe_only: probeOnly,
    actor_id: actorId,
    has_phone: Boolean(phone),
    has_username: Boolean(username),
    has_password: Boolean(password),
  };
  writeJson("manifest.json", manifest);

  const probes = {
    health: await probeRoute("/health"),
    register_config: await probeRoute("/api/v1/auth/register-config"),
    portrait_sessions: await probeRoute("/api/v1/portrait/sessions"),
  };
  writeJson("route-probes.json", probes);

  const summary = {
    ok: false,
    base_url: baseUrl,
    output_root: outputRoot,
    route_probes: probes,
    steps: [],
    failure_reason: null,
  };

  if (probeOnly) {
    summary.ok = Boolean(probes.health.ok || probes.register_config.ok || probes.portrait_sessions.ok);
    summary.failure_reason = summary.ok ? null : "probe_only_no_expected_route";
    writeJson("summary.json", summary);
    log(`probe_only_complete output_root=${outputRoot}`);
    process.exit(summary.ok ? 0 : 2);
  }

  if (probes.register_config.status === 404) {
    summary.failure_reason = "public_staging_missing_register_config_route";
    writeJson("summary.json", summary);
    log(`public staging is missing /api/v1/auth/register-config; see ${outputRoot}`);
    process.exit(2);
  }

  if (probes.portrait_sessions.status === 404) {
    summary.failure_reason = "public_staging_missing_portrait_routes";
    writeJson("summary.json", summary);
    log(`public staging is missing /api/v1/portrait/sessions; see ${outputRoot}`);
    process.exit(2);
  }

  if (!phone || !username || !password) {
    summary.failure_reason = "missing_smoke_credentials";
    writeJson("summary.json", summary);
    log("missing credentials: set TOPICLAB_PORTRAIT_SMOKE_PHONE, TOPICLAB_PORTRAIT_SMOKE_USERNAME, TOPICLAB_PORTRAIT_SMOKE_PASSWORD");
    process.exit(2);
  }

  const fixedSteps = [
    ["01-auth-ensure", ["portrait", "auth", "ensure", "--phone", phone, "--username", username, "--password", password, "--json"]],
    ["02-start", ["portrait", "start", "--mode", "legacy_product", "--actor-type", "internal", "--actor-id", actorId, "--json"]],
  ];

  let lastJson = null;
  for (const [stepName, args] of fixedSteps) {
    const result = runCli(stepName, args);
    summary.steps.push({
      step: stepName,
      exit_code: result.exit_code,
      has_json: Boolean(result.json),
    });
    if (result.exit_code !== 0) {
      summary.failure_reason = `step_failed:${stepName}`;
      writeJson("summary.json", summary);
      log(`smoke failed at ${stepName}; see ${outputRoot}`);
      process.exit(result.exit_code || 1);
    }
    lastJson = result.json;
  }

  const promptText = extractAiMemoryPrompt(lastJson || {});
  if (!promptText) {
    summary.failure_reason = "missing_ai_memory_prompt_from_start";
    writeJson("summary.json", summary);
    log(`smoke failed because start did not return an ai_memory prompt; see ${outputRoot}`);
    process.exit(1);
  }
  writeText("02-ai-memory-prompt.md", promptText);

  for (let round = 1; round <= 40; round += 1) {
    const nextStep = nextFollowupArgs(lastJson || {}, round);
    if (!nextStep) {
      break;
    }
    const result = runCli(nextStep.stepName, nextStep.args);
    summary.steps.push({
      step: nextStep.stepName,
      exit_code: result.exit_code,
      has_json: Boolean(result.json),
    });
    if (result.exit_code !== 0) {
      summary.failure_reason = `step_failed:${nextStep.stepName}`;
      writeJson("summary.json", summary);
      log(`smoke failed at ${nextStep.stepName}; see ${outputRoot}`);
      process.exit(result.exit_code || 1);
    }
    lastJson = result.json;
    if (currentSessionStatus(result.json) === "completed") {
      break;
    }
  }

  const finalSteps = [
    ["90-status", ["portrait", "status", "--json"]],
    ["91-result", ["portrait", "result", "--json"]],
    ["92-history", ["portrait", "history", "--limit", "20", "--json"]],
    ["93-export-profile-markdown", ["portrait", "export", "--kind", "profile-markdown", "--json"]],
    ["94-artifacts-list", ["portrait", "artifacts", "list", "--limit", "20", "--json"]],
  ];

  let artifactsPayload = null;
  for (const [stepName, args] of finalSteps) {
    const result = runCli(stepName, args);
    summary.steps.push({
      step: stepName,
      exit_code: result.exit_code,
      has_json: Boolean(result.json),
    });
    if (result.exit_code !== 0) {
      summary.failure_reason = `step_failed:${stepName}`;
      writeJson("summary.json", summary);
      log(`smoke failed at ${stepName}; see ${outputRoot}`);
      process.exit(result.exit_code || 1);
    }
    if (stepName === "94-artifacts-list") {
      artifactsPayload = result.json;
    }
  }

  if (artifactsPayload && Array.isArray(artifactsPayload.artifacts) && artifactsPayload.artifacts.length > 0) {
    const firstArtifact = artifactsPayload.artifacts[0];
    const artifactId =
      firstArtifact && typeof firstArtifact.artifact_id === "string" && firstArtifact.artifact_id.trim()
        ? firstArtifact.artifact_id.trim()
        : firstArtifact && typeof firstArtifact.id === "string" && firstArtifact.id.trim()
          ? firstArtifact.id.trim()
        : null;
    const binaryAvailable = Boolean(firstArtifact?.binary_available);
    const downloadUrl = typeof firstArtifact?.download_url === "string" ? firstArtifact.download_url.trim() : "";
    if (artifactId && (binaryAvailable || downloadUrl)) {
      const result = runCli("95-artifact-download", ["portrait", "artifacts", "download", artifactId, "--json"]);
      summary.steps.push({
        step: "95-artifact-download",
        exit_code: result.exit_code,
        has_json: Boolean(result.json),
      });
      if (result.exit_code !== 0) {
        summary.failure_reason = "step_failed:95-artifact-download";
        writeJson("summary.json", summary);
        log(`smoke failed at 95-artifact-download; see ${outputRoot}`);
        process.exit(result.exit_code || 1);
      }
    }
  }

  const finalStatus = currentSessionStatus(lastJson || {});
  if (finalStatus !== "completed") {
    summary.failure_reason = `session_not_completed:${finalStatus || "unknown"}`;
    writeJson("summary.json", summary);
    log(`smoke failed because the portrait session did not complete; see ${outputRoot}`);
    process.exit(1);
  }

  summary.ok = true;
  writeJson("summary.json", summary);
  log(`smoke_complete output_root=${outputRoot}`);
}

main().catch((error) => {
  const payload = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    base_url: baseUrl,
    output_root: outputRoot,
  };
  writeJson("summary.json", payload);
  process.stderr.write(`${payload.error}\n`);
  process.exit(1);
});
