// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- Test component stubs. */
import { afterEach, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  invalidate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/api", () => ({ deleteBook: mocks.remove }));
vi.mock("@tanstack/vue-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock("vue-sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/components/ui/alert-dialog", () => {
  const Slot = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h("div", slots.default?.()),
  });
  return Object.fromEntries(
    [
      "AlertDialog",
      "AlertDialogContent",
      "AlertDialogHeader",
      "AlertDialogTitle",
      "AlertDialogDescription",
      "AlertDialogFooter",
    ].map((name) => [name, Slot]),
  );
});
import DeleteGalleryDialog from "../../../src/renderer/components/feature/DeleteGalleryDialog.vue";
let app: App;
afterEach(() => {
  app?.unmount();
  vi.clearAllMocks();
});
it.each([false, true])(
  "deletes only the selected episode with permanent=%s",
  async (permanent) => {
    mocks.remove.mockResolvedValue(true);
    const host = document.createElement("div");
    const deleted = vi.fn();
    app = createApp({
      render: () =>
        h(DeleteGalleryDialog, {
          book: {
            id: 7,
            title: "Synthetic episode",
            series_collection_id: 4,
          } as never,
          onDeleted: deleted,
        }),
    });
    app.mount(host);
    const label = permanent ? "영구 삭제" : "휴지통으로 이동";
    Array.from(host.querySelectorAll("button"))
      .find((button) => button.textContent?.includes(label))!
      .click();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      await nextTick();
    }
    expect(mocks.remove).toHaveBeenCalledWith(7, { permanent });
    expect(deleted).toHaveBeenCalledOnce();
  },
);
