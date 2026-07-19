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
  it("shows the subject picker for subject-dependent tabs", () => {
    const source = readFileSync(join(process.cwd(), "src/app/teacher/page.tsx"), "utf8");

    expect(source).toContain(
      '!selectedSubject && activeTab !== "student-mgmt" && activeTab !== "exam-builder"',
    );
  });

  it("uses the seeded Số và Đại số subject for teacher demo tours", () => {
    const source = readFileSync(join(process.cwd(), "src/app/teacher/page.tsx"), "utf8");

    expect(source).toContain('const tourSubjectName = "Số và Đại số"');
    expect(source).toContain("finalSubjects.find");
    expect(source).not.toContain("finalSubjects = [tourSubject");
    expect(source).toContain('localStorage.getItem("aurora_tour_mode") === "teacher"');
    expect(source).toContain('localStorage.getItem("aurora_tour_demo_session") === "true"');
  });
});
