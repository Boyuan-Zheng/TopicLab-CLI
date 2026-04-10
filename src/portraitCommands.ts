import fs from "node:fs";
import path from "node:path";

import { Command } from "commander";

import { StateStore } from "./config.js";
import { TopicLabCLIError } from "./errors.js";
import { PortraitSessionManager } from "./portraitSession.js";

type Jsonish = Record<string, unknown> | unknown[] | string | number | boolean | null;

function emit(payload: Jsonish, asJson: boolean): number {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return 0;
  }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return 0;
}

function readUtf8File(filePath?: string): string | undefined {
  if (!filePath) {
    return undefined;
  }
  return fs.readFileSync(path.resolve(filePath), "utf8");
}

function parseJsonText(raw: string, errorCode: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new TopicLabCLIError("Invalid JSON argument", {
      code: errorCode,
      exitCode: 2,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function pickSingleInputFamily(options: {
  choice?: string;
  text?: string;
  textFile?: string;
  externalText?: string;
  externalTextFile?: string;
  externalJson?: string;
  externalJsonFile?: string;
  confirm?: boolean;
}): { choice?: string; text?: string; externalText?: string; externalJson?: unknown; confirm?: boolean } {
  const text = options.text ?? readUtf8File(options.textFile);
  const externalText = options.externalText ?? readUtf8File(options.externalTextFile);
  const externalJsonRaw = options.externalJson ?? readUtf8File(options.externalJsonFile);
  const externalJson = externalJsonRaw === undefined ? undefined : parseJsonText(externalJsonRaw, "invalid_external_json");

  let used = 0;
  if (options.choice !== undefined) {
    used += 1;
  }
  if (text !== undefined) {
    used += 1;
  }
  if (externalText !== undefined) {
    used += 1;
  }
  if (externalJson !== undefined) {
    used += 1;
  }
  if (options.confirm) {
    used += 1;
  }
  if (used !== 1) {
    throw new TopicLabCLIError("Exactly one response input family must be provided.", {
      code: "invalid_portrait_response_input",
      exitCode: 2,
      detail: {
        supported: [
          "--choice",
          "--text / --text-file",
          "--external-text / --external-text-file",
          "--external-json / --external-json-file",
          "--confirm",
        ],
      },
    });
  }

  return {
    choice: options.choice,
    text,
    externalText,
    externalJson,
    confirm: options.confirm ?? false,
  };
}

function resolveExportContent(kind: string, payload: Record<string, unknown>): string | null {
  if (kind === "structured") {
    return JSON.stringify(payload.structured_profile ?? {}, null, 2);
  }
  if (kind === "profile-markdown") {
    return typeof payload.profile_markdown === "string" ? payload.profile_markdown : null;
  }
  if (kind === "forum-markdown") {
    return typeof payload.forum_profile_markdown === "string" ? payload.forum_profile_markdown : null;
  }
  if (kind === "profile-html") {
    return typeof payload.profile_html === "string" ? payload.profile_html : null;
  }
  return null;
}

function defaultBinaryOutput(kind: string): string {
  if (kind === "profile-pdf") {
    return path.join(process.cwd(), "portrait-profile.pdf");
  }
  if (kind === "profile-image") {
    return path.join(process.cwd(), "portrait-profile.png");
  }
  throw new TopicLabCLIError("Unsupported export kind", {
    code: "unsupported_portrait_export_kind",
    exitCode: 2,
    detail: kind,
  });
}

function currentStoredSessionId(portrait: PortraitSessionManager): string | undefined {
  const state = portrait.loadState();
  return state.portrait_current_session_id ?? undefined;
}

export function registerPortraitCommands(program: Command, store: StateStore): void {
  const portrait = new PortraitSessionManager(store);
  const portraitCommand = program.command("portrait");

  const authCommand = portraitCommand.command("auth");
  authCommand
    .command("ensure")
    .requiredOption("--phone <phone>")
    .requiredOption("--password <password>")
    .option("--username <username>")
    .option("--base-url <url>")
    .option("--json")
    .action(
      async (
        options: {
          phone: string;
          password: string;
          username?: string;
          baseUrl?: string;
          json?: boolean;
        },
      ) => {
        const payload = await portrait.ensureAuth({
          baseUrl: options.baseUrl,
          phone: options.phone,
          username: options.username,
          password: options.password,
        });
        process.exit(emit(payload, options.json ?? false));
      },
    );

  portraitCommand
    .command("start")
    .option("--actor-type <type>", "actor type", "human")
    .option("--actor-id <id>")
    .option("--mode <mode>", "mode", "default")
    .option("--resume-latest")
    .option("--json")
    .action(
      async (
        options: {
          actorType?: string;
          actorId?: string;
          mode?: string;
          resumeLatest?: boolean;
          json?: boolean;
        },
      ) => {
        const payload = await portrait.startSession({
          actorType: options.actorType,
          actorId: options.actorId,
          mode: options.mode,
          resumeLatest: options.resumeLatest ?? false,
        });
        process.exit(emit(payload, options.json ?? false));
      },
    );

  portraitCommand
    .command("resume")
    .option("--json")
    .action(async (options: { json?: boolean }) => {
      const payload = await portrait.resumeSession();
      process.exit(emit(payload, options.json ?? false));
    });

  portraitCommand
    .command("status")
    .option("--session-id <id>")
    .option("--json")
    .action(async (options: { sessionId?: string; json?: boolean }) => {
      const payload = await portrait.getStatus(options.sessionId);
      process.exit(emit(payload, options.json ?? false));
    });

  portraitCommand
    .command("result")
    .option("--session-id <id>")
    .option("--json")
    .action(async (options: { sessionId?: string; json?: boolean }) => {
      const payload = await portrait.getResult(options.sessionId);
      process.exit(emit(payload, options.json ?? false));
    });

  portraitCommand
    .command("history")
    .option("--session-id <id>")
    .option("--limit <number>", "limit", "20")
    .option("--json")
    .action(async (options: { sessionId?: string; limit: string; json?: boolean }) => {
      const payload = await portrait.getHistory(options.sessionId, Number(options.limit));
      process.exit(emit(payload, options.json ?? false));
    });

  portraitCommand
    .command("reset")
    .option("--session-id <id>")
    .option("--json")
    .action(async (options: { sessionId?: string; json?: boolean }) => {
      const payload = await portrait.resetSession(options.sessionId);
      process.exit(emit(payload, options.json ?? false));
    });

  portraitCommand
    .command("respond")
    .option("--session-id <id>")
    .option("--choice <value>")
    .option("--text <text>")
    .option("--text-file <path>")
    .option("--external-text <text>")
    .option("--external-text-file <path>")
    .option("--external-json <json>")
    .option("--external-json-file <path>")
    .option("--confirm")
    .option("--json")
    .action(
      async (
        options: {
          sessionId?: string;
          choice?: string;
          text?: string;
          textFile?: string;
          externalText?: string;
          externalTextFile?: string;
          externalJson?: string;
          externalJsonFile?: string;
          confirm?: boolean;
          json?: boolean;
        },
      ) => {
        const input = pickSingleInputFamily(options);
        const payload = await portrait.respond({
          sessionId: options.sessionId,
          choice: input.choice,
          text: input.text,
          externalText: input.externalText,
          externalJson: input.externalJson,
          confirm: input.confirm,
        });
        process.exit(emit(payload, options.json ?? false));
      },
    );

  portraitCommand
    .command("export")
    .requiredOption("--kind <kind>")
    .option("--display-name <name>")
    .option("--session-id <id>")
    .option("--output <path>")
    .option("--json")
    .action(
      async (
        options: {
          kind: string;
          displayName?: string;
          sessionId?: string;
          output?: string;
          json?: boolean;
        },
      ) => {
        const sourceSessionId = options.sessionId ?? currentStoredSessionId(portrait);
        const params = {
          display_name: options.displayName,
          source_session_id: sourceSessionId,
        };

        let payload: Record<string, unknown>;
        if (options.kind === "structured") {
          payload = await portrait.request("GET", "/api/v1/portrait/export/structured", { params });
        } else if (options.kind === "profile-markdown") {
          payload = await portrait.request("GET", "/api/v1/portrait/export/profile-markdown", { params });
        } else if (options.kind === "forum-markdown") {
          payload = await portrait.request("POST", "/api/v1/portrait/export/forum-markdown", {
            jsonBody: {
              display_name: options.displayName,
              source_session_id: sourceSessionId,
            },
          });
        } else if (options.kind === "profile-html") {
          payload = await portrait.request("GET", "/api/v1/portrait/export/profile-html", { params });
        } else if (options.kind === "profile-pdf" || options.kind === "profile-image") {
          const requestPath =
            options.kind === "profile-pdf"
              ? "/api/v1/portrait/export/profile-pdf"
              : "/api/v1/portrait/export/profile-image";
          const binary = await portrait.downloadBinary(requestPath, { params });
          const outputPath = path.resolve(options.output ?? defaultBinaryOutput(options.kind));
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, binary.buffer);
          process.exit(
            emit(
              {
                ok: true,
                kind: options.kind,
                output_path: outputPath,
                content_type: binary.contentType,
                byte_length: binary.buffer.length,
                source_session_id: sourceSessionId ?? null,
              },
              options.json ?? false,
            ),
          );
          return;
        } else {
          throw new TopicLabCLIError("Unsupported portrait export kind", {
            code: "unsupported_portrait_export_kind",
            exitCode: 2,
            detail: options.kind,
          });
        }

        const content = resolveExportContent(options.kind, payload);
        if (options.output && content !== null) {
          const outputPath = path.resolve(options.output);
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, content, "utf8");
          payload.output_path = outputPath;
        }
        process.exit(emit(payload, options.json ?? false));
      },
    );
}
