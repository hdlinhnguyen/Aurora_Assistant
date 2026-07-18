type Clock = () => number;

type QuestionTimerOptions = {
  now?: Clock;
  idleAfterMs?: number;
};

export type QuestionTimingSnapshot = {
  attemptId: string;
  elapsedTimeMs: number;
  activeTimeMs: number;
  hintTimeMs: number;
  answerChangeCount: number;
  hintCount: number;
};

const SENSITIVE_KEYS = new Set([
  "answer_text",
  "content",
  "email",
  "image",
  "message",
  "name",
  "token",
]);

export function sanitizeProperties(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("properties_must_be_object");
  }
  return sanitizeRecord(value);
}

function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      throw new Error("sensitive_property");
    }
    output[key] = sanitizeValue(nested);
  }
  return output;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (isRecord(value)) {
    return sanitizeRecord(value);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class QuestionTimer {
  private readonly now: Clock;
  private readonly idleAfterMs: number;
  private attemptId = "";
  private presentedAt = 0;
  private lastObservedAt = 0;
  private lastActivityAt = 0;
  private activeMilliseconds = 0;
  private hintMilliseconds = 0;
  private hintStartedAt: number | null = null;
  private focused = true;
  private visible = true;
  private answerChangeCount = 0;
  private hintCount = 0;

  constructor(options: QuestionTimerOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.idleAfterMs = options.idleAfterMs ?? 30_000;
  }

  present(attemptId: string) {
    const timestamp = this.now();
    this.attemptId = attemptId;
    this.presentedAt = timestamp;
    this.lastObservedAt = timestamp;
    this.lastActivityAt = timestamp;
    this.activeMilliseconds = 0;
    this.hintMilliseconds = 0;
    this.hintStartedAt = null;
    this.focused = true;
    this.visible = true;
    this.answerChangeCount = 0;
    this.hintCount = 0;
  }

  setFocused(focused: boolean) {
    this.sync();
    this.focused = focused;
    const timestamp = this.now();
    if (focused) this.lastActivityAt = timestamp;
    this.lastObservedAt = timestamp;
  }

  setVisible(visible: boolean) {
    this.sync();
    this.visible = visible;
    const timestamp = this.now();
    if (visible) this.lastActivityAt = timestamp;
    this.lastObservedAt = timestamp;
  }

  markActivity() {
    this.sync();
    const timestamp = this.now();
    this.lastActivityAt = timestamp;
    this.lastObservedAt = timestamp;
  }

  recordAnswerChange() {
    this.sync();
    this.answerChangeCount += 1;
  }

  markHintViewed() {
    this.sync();
    this.hintCount += 1;
    this.hintStartedAt = this.now();
  }

  markHintDismissed() {
    this.sync();
    this.hintStartedAt = null;
  }

  snapshot(): QuestionTimingSnapshot {
    this.sync();
    const elapsedTimeMs = Math.max(0, this.now() - this.presentedAt);
    return {
      attemptId: this.attemptId,
      elapsedTimeMs,
      activeTimeMs: this.activeMilliseconds,
      hintTimeMs: this.hintMilliseconds,
      answerChangeCount: this.answerChangeCount,
      hintCount: this.hintCount,
    };
  }

  private sync() {
    if (!this.attemptId) return;
    const timestamp = this.now();
    const delta = Math.max(0, timestamp - this.lastObservedAt);
    if (this.focused && this.visible) {
      const idleRemaining = Math.max(0, this.idleAfterMs - (this.lastObservedAt - this.lastActivityAt));
      const activeDelta = Math.min(delta, idleRemaining);
      this.activeMilliseconds += activeDelta;
      if (this.hintStartedAt !== null) {
        this.hintMilliseconds += activeDelta;
      }
    }
    this.lastObservedAt = timestamp;
  }
}

export type TelemetryEvent = {
  event_id: string;
  event_name: string;
  schema_version: number;
  occurred_at: string;
  session_id?: string;
  attempt_id?: string;
  topic_id?: string;
  source: "frontend";
  consent_state: "required" | "optional_allowed" | "optional_denied";
  retention_class: "interaction" | "decision" | "aggregate";
  properties: Record<string, unknown>;
};

export type TelemetrySender = (events: TelemetryEvent[]) => Promise<void>;

type TelemetryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const TELEMETRY_QUEUE_KEY = "aurora_telemetry_queue_v1";
const UUID_PATH_SEGMENT = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

export function normalizeEndpoint(endpoint: string): string {
  return endpoint.split("?", 1)[0].replace(UUID_PATH_SEGMENT, ":id");
}

export class TelemetryClient {
  private readonly sender: TelemetrySender;
  private readonly storage?: TelemetryStorage;
  private queue: TelemetryEvent[] = [];

  constructor(sender: TelemetrySender, storage: TelemetryStorage | undefined = browserStorage()) {
    this.sender = sender;
    this.storage = storage;
    this.queue = this.loadQueue();
  }

  track(
    eventName: string,
    properties: Record<string, unknown>,
    context: Pick<TelemetryEvent, "session_id" | "attempt_id" | "topic_id"> = {},
  ) {
    this.queue.push({
      event_id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      event_name: eventName,
      schema_version: 1,
      occurred_at: new Date().toISOString(),
      source: "frontend",
      consent_state: "required",
      retention_class: "interaction",
      ...context,
      properties: sanitizeProperties(properties),
    });
    this.persistQueue();
  }

  async flush() {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, 20);
    try {
      await this.sender(batch);
      this.persistQueue();
    } catch (error) {
      this.queue = [...batch, ...this.queue].slice(0, 200);
      this.persistQueue();
      throw error;
    }
  }

  private loadQueue(): TelemetryEvent[] {
    const encoded = this.storage?.getItem(TELEMETRY_QUEUE_KEY);
    if (!encoded) return [];
    try {
      const parsed = JSON.parse(encoded);
      return Array.isArray(parsed) ? parsed.slice(0, 200) : [];
    } catch {
      this.storage?.removeItem(TELEMETRY_QUEUE_KEY);
      return [];
    }
  }

  private persistQueue() {
    if (!this.storage) return;
    if (this.queue.length === 0) {
      this.storage.removeItem(TELEMETRY_QUEUE_KEY);
      return;
    }
    this.storage.setItem(TELEMETRY_QUEUE_KEY, JSON.stringify(this.queue.slice(0, 200)));
  }
}

function browserStorage(): TelemetryStorage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

async function sendTelemetryBatch(events: TelemetryEvent[]) {
  if (typeof window === "undefined") return;
  const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8081/api";
  const token = window.localStorage.getItem("aurora_token");
  const response = await fetch(`${baseURL}/telemetry/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ events }),
    keepalive: true,
  });
  if (!response.ok) {
    throw new Error(`telemetry_http_${response.status}`);
  }
}

export const telemetry = new TelemetryClient(sendTelemetryBatch);
