import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import KnowledgeTree, { selectDefaultFocusNode } from "./KnowledgeTree";

const treeNodes = [
  {
    id: "root",
    subject: "Math",
    name: "Root",
    theory: "",
    posX: 0,
    posY: 0,
    isRoot: true,
  },
  {
    id: "child",
    subject: "Math",
    name: "Child",
    theory: "",
    posX: 100,
    posY: 100,
    isRoot: false,
  },
];

const treeEdges = [
  {
    id: "edge",
    subject: "Math",
    sourceId: "root",
    targetId: "child",
  },
];

describe("selectDefaultFocusNode", () => {
  it("uses valid controlled and fallback identifiers in priority order", () => {
    expect(selectDefaultFocusNode(treeNodes, "child", "missing", "root")).toBe("child");
    expect(selectDefaultFocusNode(treeNodes, "missing", "child", "root")).toBe("child");
    expect(selectDefaultFocusNode(treeNodes, "missing", "missing", "root")).toBe("root");
    expect(selectDefaultFocusNode(treeNodes, "missing", "missing", "missing")).toBe("root");
  });

  it("falls back to the first node and returns null for an empty tree", () => {
    expect(selectDefaultFocusNode([{ ...treeNodes[1], id: "only" }])).toBe("only");
    expect(selectDefaultFocusNode([])).toBeNull();
  });
});

describe("KnowledgeTree map mode", () => {
  it.each(["teacher", "student", "view-only"] as const)(
    "opens in focused mode for %s trees",
    (mode) => {
      render(<KnowledgeTree subject="Math" nodes={treeNodes} edges={treeEdges} mode={mode} />);

      expect(screen.getByRole("button", { name: "Sơ đồ tập trung" })).toHaveClass("bg-card");
      expect(screen.getByRole("button", { name: "Sơ đồ tổng thể" })).not.toHaveClass("bg-card");
    },
  );

  it("switches modes and resets to focused mode when the subject changes", () => {
    const { rerender } = render(
      <KnowledgeTree subject="Math" nodes={treeNodes} edges={treeEdges} mode="teacher" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sơ đồ tổng thể" }));
    expect(screen.getByRole("button", { name: "Sơ đồ tổng thể" })).toHaveClass("bg-card");

    rerender(
      <KnowledgeTree
        subject="Physics"
        nodes={treeNodes.map((node) => ({ ...node, subject: "Physics" }))}
        edges={treeEdges.map((edge) => ({ ...edge, subject: "Physics" }))}
        mode="teacher"
      />,
    );

    expect(screen.getByRole("button", { name: "Sơ đồ tập trung" })).toHaveClass("bg-card");
  });

  it("hides the selector for an empty tree", () => {
    render(<KnowledgeTree subject="Math" nodes={[]} edges={[]} mode="teacher" />);

    expect(screen.queryByRole("button", { name: "Sơ đồ tập trung" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sơ đồ tổng thể" })).not.toBeInTheDocument();
  });
});
