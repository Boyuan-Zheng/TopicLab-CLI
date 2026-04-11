import { CLIState, StateStore } from "./config.js";
import { TopicLabCLIError } from "./errors.js";
import { normalizeBaseUrl, TopicLabHTTPClient, TopicLabJSON } from "./http.js";

type AuthPayload = {
  token: string;
  user: Record<string, unknown>;
};

type AutoRegisterResult =
  | { status: "registered"; payload: AuthPayload }
  | { status: "already_exists" }
  | { status: "not_allowed" };

function asObject(payload: TopicLabJSON, code: string): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TopicLabCLIError("Expected JSON object response from TopicLab", {
      code,
      exitCode: 4,
    });
  }
  return payload;
}

export class PortraitSessionManager {
  store: StateStore;

  constructor(store: StateStore = new StateStore()) {
    this.store = store;
  }

  loadState(): CLIState {
    return this.store.load();
  }

  private detailText(detail: unknown): string {
    if (typeof detail === "string") {
      return detail.trim();
    }
    if (detail && typeof detail === "object") {
      try {
        return JSON.stringify(detail, null, 2);
      } catch {
        return String(detail);
      }
    }
    return String(detail ?? "");
  }

  private isAlreadyRegisteredError(error: TopicLabCLIError): boolean {
    if (error.statusCode !== 400) {
      return false;
    }
    return this.detailText(error.detail).includes("该手机号已注册");
  }

  private parseAuthPayload(payload: TopicLabJSON, code: string): AuthPayload {
    const authPayload = asObject(payload, code);
    const token = typeof authPayload.token === "string" ? authPayload.token.trim() : "";
    if (!token) {
      throw new TopicLabCLIError("TopicLab auth succeeded but returned no token", {
        code: "missing_auth_token",
        exitCode: 4,
      });
    }
    const user =
      authPayload.user && typeof authPayload.user === "object" && !Array.isArray(authPayload.user)
        ? (authPayload.user as Record<string, unknown>)
        : {};
    return { token, user };
  }

  private saveState(state: CLIState): void {
    state.last_refreshed_at = new Date().toISOString();
    this.store.save(state);
  }

  private requireBaseUrl(state: CLIState): string {
    if (!state.base_url) {
      throw new TopicLabCLIError("Missing TopicLab base URL. Provide --base-url or set TOPICLAB_BASE_URL.", {
        code: "missing_base_url",
        exitCode: 6,
      });
    }
    return state.base_url;
  }

  private updateCurrentSessionIdFromPayload(payload: Record<string, unknown>): void {
    const state = this.store.load();
    const session =
      payload.session && typeof payload.session === "object" && !Array.isArray(payload.session)
        ? (payload.session as Record<string, unknown>)
        : null;
    const sessionId = typeof session?.session_id === "string" && session.session_id.trim() ? session.session_id.trim() : null;
    if (!sessionId) {
      return;
    }
    state.portrait_current_session_id = sessionId;
    this.saveState(state);
  }

  private async tryAutoRegister(
    client: TopicLabHTTPClient,
    options: {
      phone: string;
      username: string;
      password: string;
    },
  ): Promise<AutoRegisterResult> {
    const configPayload = asObject(
      await client.requestJson("GET", "/api/v1/auth/register-config"),
      "invalid_register_config",
    );
    if (configPayload.registration_requires_sms === true) {
      return { status: "not_allowed" };
    }

    try {
      const payload = this.parseAuthPayload(
        await client.requestJson("POST", "/api/v1/auth/register", {
          jsonBody: {
            phone: options.phone,
            username: options.username,
            password: options.password,
            code: "",
          },
        }),
        "invalid_auth_payload",
      );
      return { status: "registered", payload };
    } catch (error) {
      if (!(error instanceof TopicLabCLIError)) {
        throw error;
      }
      if (this.isAlreadyRegisteredError(error)) {
        return { status: "already_exists" };
      }
      throw error;
    }
  }

  private persistAuth(
    state: CLIState,
    options: {
      phone: string;
      username?: string;
    },
    payload: AuthPayload,
  ): Record<string, unknown> {
    state.portrait_access_token = payload.token;
    state.portrait_auth_phone = options.phone;
    state.portrait_username =
      options.username?.trim() ||
      (typeof payload.user.username === "string" && payload.user.username.trim() ? payload.user.username.trim() : state.portrait_username);
    state.portrait_user = payload.user;
    this.saveState(state);

    return {
      user: payload.user,
      last_refreshed_at: state.last_refreshed_at,
    };
  }

  async ensureAuth(options: {
    baseUrl?: string;
    phone: string;
    username?: string;
    password: string;
  }): Promise<Record<string, unknown>> {
    const state = this.store.load();
    if (options.baseUrl) {
      state.base_url = normalizeBaseUrl(options.baseUrl);
    }
    const baseUrl = this.requireBaseUrl(state);
    const client = new TopicLabHTTPClient(baseUrl);

    let registrationAttempted = false;
    try {
      const auth = this.parseAuthPayload(
        await client.requestJson("POST", "/api/v1/auth/login", {
          jsonBody: {
            phone: options.phone,
            password: options.password,
          },
        }),
        "invalid_auth_payload",
      );
      const saved = this.persistAuth(state, { phone: options.phone, username: options.username }, auth);
      return {
        ok: true,
        base_url: baseUrl,
        registration_attempted: false,
        auth_action: "login",
        ...saved,
      };
    } catch (error) {
      if (!(error instanceof TopicLabCLIError) || error.statusCode !== 400 || !options.username?.trim()) {
        throw error;
      }

      const registerResult = await this.tryAutoRegister(client, {
        phone: options.phone,
        username: options.username.trim(),
        password: options.password,
      });
      registrationAttempted = registerResult.status !== "not_allowed";

      if (registerResult.status === "registered") {
        const saved = this.persistAuth(state, { phone: options.phone, username: options.username }, registerResult.payload);
        return {
          ok: true,
          base_url: baseUrl,
          registration_attempted: registrationAttempted,
          auth_action: "register",
          ...saved,
        };
      }

      if (registerResult.status === "not_allowed") {
        throw error;
      }

      const auth = this.parseAuthPayload(
        await client.requestJson("POST", "/api/v1/auth/login", {
          jsonBody: {
            phone: options.phone,
            password: options.password,
          },
        }),
        "invalid_auth_payload",
      );
      const saved = this.persistAuth(state, { phone: options.phone, username: options.username }, auth);
      return {
        ok: true,
        base_url: baseUrl,
        registration_attempted: registrationAttempted,
        auth_action: "login_existing_account",
        ...saved,
      };
    }
  }

  async authedClient(): Promise<TopicLabHTTPClient> {
    const state = this.store.load();
    const baseUrl = this.requireBaseUrl(state);
    if (!state.portrait_access_token) {
      throw new TopicLabCLIError("Missing portrait auth token. Run `topiclab portrait auth ensure ...` first.", {
        code: "missing_portrait_auth",
        exitCode: 6,
      });
    }
    return new TopicLabHTTPClient(baseUrl, state.portrait_access_token);
  }

  async request(
    method: string,
    requestPath: string,
    options: {
      params?: Record<string, unknown>;
      jsonBody?: unknown;
    } = {},
  ): Promise<Record<string, unknown>> {
    try {
      return asObject(await (await this.authedClient()).requestJson(method, requestPath, options), "invalid_portrait_payload");
    } catch (error) {
      if (error instanceof TopicLabCLIError && error.statusCode === 401) {
        throw new TopicLabCLIError("Portrait auth expired or is invalid. Re-run `topiclab portrait auth ensure ...`.", {
          code: "portrait_auth_error",
          exitCode: 6,
          statusCode: 401,
          detail: error.detail,
        });
      }
      throw error;
    }
  }

  async downloadBinary(
    requestPath: string,
    options: {
      params?: Record<string, unknown>;
    } = {},
  ): Promise<{ buffer: Buffer; contentType: string | null; fileName: string | null; artifactId: string | null }> {
    try {
      return await (await this.authedClient()).downloadBinary(requestPath, options);
    } catch (error) {
      if (error instanceof TopicLabCLIError && error.statusCode === 401) {
        throw new TopicLabCLIError("Portrait auth expired or is invalid. Re-run `topiclab portrait auth ensure ...`.", {
          code: "portrait_auth_error",
          exitCode: 6,
          statusCode: 401,
          detail: error.detail,
        });
      }
      throw error;
    }
  }

  resolveCurrentSessionId(sessionId?: string): string {
    if (sessionId?.trim()) {
      return sessionId.trim();
    }
    const state = this.store.load();
    if (state.portrait_current_session_id?.trim()) {
      return state.portrait_current_session_id.trim();
    }
    throw new TopicLabCLIError("No active portrait session is stored locally. Run `topiclab portrait start` first or pass --session-id.", {
      code: "missing_portrait_session_id",
      exitCode: 6,
    });
  }

  async listSessions(limit = 20): Promise<Record<string, unknown>> {
    const payload = await this.request("GET", "/api/v1/portrait/sessions", {
      params: { limit },
    });
    const activeId =
      typeof payload.current_active_session_id === "string" && payload.current_active_session_id.trim()
        ? payload.current_active_session_id.trim()
        : null;
    if (activeId) {
      const state = this.store.load();
      state.portrait_current_session_id = activeId;
      this.saveState(state);
    }
    return payload;
  }

  async startSession(options: {
    actorType?: string;
    actorId?: string;
    mode?: string;
    resumeLatest?: boolean;
  }): Promise<Record<string, unknown>> {
    const payload = await this.request("POST", "/api/v1/portrait/sessions", {
      jsonBody: {
        actor_type: options.actorType ?? "human",
        actor_id: options.actorId,
        mode: options.mode ?? "default",
        resume_latest: options.resumeLatest ?? false,
      },
    });
    this.updateCurrentSessionIdFromPayload(payload);
    return payload;
  }

  async resumeSession(): Promise<Record<string, unknown>> {
    const listed = await this.listSessions(20);
    const activeId =
      typeof listed.current_active_session_id === "string" && listed.current_active_session_id.trim()
        ? listed.current_active_session_id.trim()
        : null;
    if (!activeId) {
      throw new TopicLabCLIError("No active portrait session exists on this account.", {
        code: "portrait_session_not_found",
        exitCode: 6,
      });
    }
    return this.getStatus(activeId);
  }

  async getStatus(sessionId?: string): Promise<Record<string, unknown>> {
    const payload = await this.request("GET", `/api/v1/portrait/sessions/${this.resolveCurrentSessionId(sessionId)}`);
    this.updateCurrentSessionIdFromPayload(payload);
    return payload;
  }

  async getResult(sessionId?: string): Promise<Record<string, unknown>> {
    const payload = await this.request("GET", `/api/v1/portrait/sessions/${this.resolveCurrentSessionId(sessionId)}/result`);
    this.updateCurrentSessionIdFromPayload(payload);
    return payload;
  }

  async getHistory(sessionId?: string, limit = 20): Promise<Record<string, unknown>> {
    const payload = await this.request("GET", `/api/v1/portrait/sessions/${this.resolveCurrentSessionId(sessionId)}/history`, {
      params: { limit },
    });
    this.updateCurrentSessionIdFromPayload(payload);
    return payload;
  }

  async respond(
    payload: {
      sessionId?: string;
      choice?: string | number;
      text?: string;
      externalText?: string;
      externalJson?: unknown;
      confirm?: boolean;
    },
  ): Promise<Record<string, unknown>> {
    const requestPayload: Record<string, unknown> = {};
    if (payload.choice !== undefined) {
      requestPayload.choice = payload.choice;
    }
    if (payload.text !== undefined) {
      requestPayload.text = payload.text;
    }
    if (payload.externalText !== undefined) {
      requestPayload.external_text = payload.externalText;
    }
    if (payload.externalJson !== undefined) {
      requestPayload.external_json = payload.externalJson;
    }
    if (payload.confirm) {
      requestPayload.confirm = true;
    }
    const responsePayload = await this.request(
      "POST",
      `/api/v1/portrait/sessions/${this.resolveCurrentSessionId(payload.sessionId)}/respond`,
      { jsonBody: requestPayload },
    );
    this.updateCurrentSessionIdFromPayload(responsePayload);
    return responsePayload;
  }

  async resetSession(sessionId?: string): Promise<Record<string, unknown>> {
    const payload = await this.request("POST", `/api/v1/portrait/sessions/${this.resolveCurrentSessionId(sessionId)}/reset`);
    this.updateCurrentSessionIdFromPayload(payload);
    return payload;
  }
}
