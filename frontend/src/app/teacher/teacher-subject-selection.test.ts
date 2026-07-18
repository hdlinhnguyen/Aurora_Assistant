import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveTeacherSubject } from "./teacher-subject-selection";

describe("resolveTeacherSubject", () => {
  it("requires an explicit choice when subjects are loaded", () => {
    expect(resolveTeacherSubject(["Toán", "Ngữ văn"])).toBe("");
  });

  it("keeps an explicit subject choice that exists", () => {
    expect(resolveTeacherSubject(["Toán", "Ngữ văn"], "Ngữ văn")).toBe("Ngữ văn");
  });

  it("rejects an explicit subject choice that no longer exists", () => {
    expect(resolveTeacherSubject(["Toán"], "Ngữ văn")).toBe("");
  });
});

describe("Teacher Hub subject gate", () => {
  it("shows the subject picker for every tab until a subject is selected", () => {
    const source = readFileSync(join(process.cwd(), "src/app/teacher/page.tsx"), "utf8");

    expect(source).toContain('{!selectedSubject ? (');
    expect(source).not.toContain(
      '!selectedSubject && activeTab !== "student-mgmt" && activeTab !== "exam-builder" && activeTab !== "exam-scoring"',
    );
  });
});
