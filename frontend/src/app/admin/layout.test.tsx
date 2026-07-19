import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminLayout from "./layout";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/admin",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));

describe("AdminLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }));
    localStorage.setItem("aurora_token", "token");
    localStorage.setItem("aurora_user", JSON.stringify({ role: "admin", name: "Admin" }));
  });

  it("keeps the logout footer in the viewport while the main area scrolls", async () => {
    render(
      <AdminLayout>
        <div>Long admin content</div>
      </AdminLayout>,
    );

    expect(await screen.findByRole("button", { name: /đăng xuất/i })).toBeInTheDocument();
    const sidebar = screen.getByRole("complementary");
    const shell = sidebar.parentElement;
    const main = screen.getByRole("main");

    expect(shell).not.toBeNull();
    expect(shell).toHaveClass("h-screen");
    expect(sidebar).toHaveClass("h-screen");
    expect(main).toHaveClass("min-h-0");
  });
});
