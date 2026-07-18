import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

class TestResizeObserver implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: new DOMRect(0, 0, 800, 400) } as ResizeObserverEntry],
      this,
    );
  }
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = TestResizeObserver;

afterEach(() => cleanup());
