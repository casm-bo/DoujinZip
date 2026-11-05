import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ exit: vi.fn(), showErrorBox: vi.fn() }));
vi.mock("electron", () => ({
  app: { exit: mocks.exit },
  dialog: { showErrorBox: mocks.showErrorBox },
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.clearAllMocks();
});

it.each(["uncaughtException", "unhandledRejection"])(
  "shows %s and exits even when the dialog fails",
  async (event) => {
    const handlers = new Map<string | symbol, (error: unknown) => void>();
    vi.spyOn(process, "on").mockImplementation((name, handler) => {
      handlers.set(name, handler);
      return process;
    });
    await import("../../../src/main/fatalErrors");
    const error = new Error("migration missing");
    mocks.showErrorBox.mockImplementationOnce(() => {
      throw new Error("dialog failed");
    });
    expect(() => handlers.get(event)!(error)).toThrow("dialog failed");
    expect(mocks.showErrorBox).toHaveBeenCalledWith("동인집 오류", error.stack);
    expect(mocks.exit).toHaveBeenCalledWith(1);
    handlers.get(event)!(error);
    expect(mocks.exit).toHaveBeenCalledTimes(1);
  },
);

