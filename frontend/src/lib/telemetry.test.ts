import { describe, expect, it } from "vitest";

import {
  normalizeEndpoint,
  QuestionTimer,
  sanitizeProperties,
  TelemetryClient,
} from "./telemetry";

class FakeClock {
  private current = 0;

  now = () => this.current;

  advanceBy(milliseconds: number) {
    this.current += milliseconds;
  }
}

describe("QuestionTimer", () => {
  it("counts only focused visible active milliseconds", () => {
    const clock = new FakeClock();
    const timer = new QuestionTimer({ now: clock.now, idleAfterMs: 30_000 });
    timer.present("attempt-1");
    clock.advanceBy(10_000);
    timer.setFocused(false);
    clock.advanceBy(20_000);
    timer.setFocused(true);
    clock.advanceBy(5_000);

    expect(timer.snapshot().activeTimeMs).toBe(15_000);
    expect(timer.snapshot().elapsedTimeMs).toBe(35_000);
  });

  it("excludes time after the idle threshold until activity resumes", () => {
    const clock = new FakeClock();
    const timer = new QuestionTimer({ now: clock.now, idleAfterMs: 30_000 });
    timer.present("attempt-1");
    clock.advanceBy(45_000);

    expect(timer.snapshot().activeTimeMs).toBe(30_000);
    timer.markActivity();
    clock.advanceBy(5_000);
    expect(timer.snapshot().activeTimeMs).toBe(35_000);
  });

  it("tracks answer changes and hint usage without answer content", () => {
    const clock = new FakeClock();
    const timer = new QuestionTimer({ now: clock.now, idleAfterMs: 30_000 });
    timer.present("attempt-1");
    timer.recordAnswerChange();
    timer.recordAnswerChange();
    timer.markHintViewed();

    expect(timer.snapshot()).toMatchObject({
      attemptId: "attempt-1",
      answerChangeCount: 2,
      hintCount: 1,
    });
  });
});

describe("sanitizeProperties", () => {
  it("rejects sensitive keys at any nesting level", () => {
    expect(() => sanitizeProperties({ answer_text: "student response" })).toThrowError(
      "sensitive_property",
    );
    expect(() =>
      sanitizeProperties({ metadata: { profile: { email: "student@example.test" } } }),
    ).toThrowError("sensitive_property");
  });

  it("preserves approved metric properties", () => {
    expect(sanitizeProperties({ question_id: "q-1", active_time_ms: 1200 })).toEqual({
      question_id: "q-1",
      active_time_ms: 1200,
    });
  });
});

describe("TelemetryClient", () => {
  it("persists a failed batch and retries it from a new client", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const first = new TelemetryClient(async () => {
      throw new Error("offline");
    }, storage);
    first.track("question_presented", { question_id: "q-1" });
    await expect(first.flush()).rejects.toThrowError("offline");

    const sent: unknown[] = [];
    const second = new TelemetryClient(async (events) => {
      sent.push(...events);
    }, storage);
    await second.flush();

    expect(sent).toHaveLength(1);
    expect(storage.getItem("aurora_telemetry_queue_v1")).toBeNull();
  });
});

describe("normalizeEndpoint", () => {
  it("removes query values and replaces UUID path segments", () => {
    expect(
      normalizeEndpoint(
        "/nodes/4d2a4a84-5c64-4e21-90ce-78b1cf5d9a3a/answer?studentEmail=secret@example.test",
      ),
    ).toBe("/nodes/:id/answer");
  });
});
