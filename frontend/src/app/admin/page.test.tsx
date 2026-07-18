import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import AdminDashboard from "./page";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("./components/TelemetryDashboard", () => ({
  default: () => <div data-testid="telemetry-dashboard">Telemetry dashboard marker</div>,
}));

describe("AdminDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockImplementation(async (endpoint: string) => {
      if (endpoint === "/admin/teachers" || endpoint === "/admin/classrooms" || endpoint === "/subjects") return [];
      throw new Error(`unexpected endpoint ${endpoint}`);
    });
  });

  it("mounts the Metrics & EDA section below the existing overview", async () => {
    render(<AdminDashboard />);

    expect(await screen.findByRole("heading", { name: "Metrics & EDA" })).toBeInTheDocument();
    expect(screen.getByTestId("telemetry-dashboard")).toBeInTheDocument();
  });
});
