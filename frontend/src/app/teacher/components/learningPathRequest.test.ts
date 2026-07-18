import { describe, expect, it } from "vitest";

import { buildLearningPathRequest } from "./learningPathRequest";

describe("buildLearningPathRequest", () => {
  it("sends selected students and topics without a demo classroom", () => {
    const body = buildLearningPathRequest(["student-1"], ["topic-1"]);

    expect(body).toEqual({ studentIds: ["student-1"], targetTopicIds: ["topic-1"] });
    expect(body).not.toHaveProperty("classId");
  });
});
