import { render, screen, waitFor } from "@testing-library/react";
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

  it("loads classroom students through the admin route", async () => {
    vi.mocked(apiFetch).mockImplementation(async (endpoint: string) => {
      if (endpoint === "/admin/teachers" || endpoint === "/subjects") return [];
      if (endpoint === "/admin/classrooms") return [{ id: "class-1" }];
      if (endpoint === "/admin/classrooms/class-1/students") return [{ id: "student-1" }];
      throw new Error(`unexpected endpoint ${endpoint}`);
    });

    render(<AdminDashboard />);

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/admin/classrooms/class-1/students"));
  });
});
