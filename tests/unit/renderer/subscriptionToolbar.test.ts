// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";
import { createPinia } from "pinia";
const api = vi.hoisted(() => ({
  getSubscriptions: vi.fn(async () => ({ items: [], errors: {} })),
  addSubscription: vi.fn(async () => ({})),
  ipcRenderer: {
    invoke: vi.fn(async () => ({
      success: true,
      data: [{ value: "korean", label: "한국어" }],
    })),
  },
}));
vi.mock("@/api", () => api);
vi.mock("@/components/common/SmartSearchInput.vue", () => ({
  default: { props: ["modelValue"], template: '<input :value="modelValue" />' },
}));
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../../src/renderer/components/ui/dropdown-menu";
import SubscriptionToolbar from "../../../src/renderer/components/feature/downloader/SubscriptionToolbar.vue";
let app: App;
afterEach(() => {
  app?.unmount();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});
const settle = async () => {
  for (let i = 0; i < 8; i++) await nextTick();
};
it("keeps externally opened management and subscription dialogs open, saving only after confirmation", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const host = document.createElement("div");
  document.body.append(host);
  let toolbar: InstanceType<typeof SubscriptionToolbar> | null = null;
  app = createApp({
    render: () =>
      h(SubscriptionToolbar, {
        ref: (value) => {
          toolbar = value as typeof toolbar;
        },
        newCount: 0,
        lastCheckedAt: null,
        language: "korean",
        blacklistCount: 0,
      }),
  });
  app.use(createPinia());
  app.mount(host);
  await toolbar!.openManager();
  await settle();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "구독 관리",
  );
  document
    .querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!
    .click();
  await settle();
  await toolbar!.openSubscribe("artist:hi_hello");
  await settle();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "검색 구독하기",
  );
  expect(api.addSubscription).not.toHaveBeenCalled();
  const button = [
    ...Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
    ),
  ].find((item) => item.textContent === "구독하기")!;
  button.click();
  await settle();
  expect(api.addSubscription).toHaveBeenCalledWith({
    query: "language:korean artist:hi_hello",
    label: "",
  });
});

it("keeps the manager visible after the more menu closes", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  let toolbar: InstanceType<typeof SubscriptionToolbar> | null = null;
  app = createApp({
    render: () =>
      h("div", [
        h(
          DropdownMenu,
          { defaultOpen: true },
          {
            default: () => [
              h(DropdownMenuTrigger, {}, { default: () => "더보기" }),
              h(
                DropdownMenuContent,
                {},
                {
                  default: () =>
                    h(
                      DropdownMenuItem,
                      { onSelect: () => toolbar?.openManager() },
                      { default: () => "메뉴에서 관리" },
                    ),
                },
              ),
            ],
          },
        ),
        h(SubscriptionToolbar, {
          ref: (value) => {
            toolbar = value as typeof toolbar;
          },
          newCount: 0,
          lastCheckedAt: null,
          language: "korean",
          blacklistCount: 0,
        }),
      ]),
  });
  app.use(createPinia());
  app.mount(host);
  await settle();
  Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .find((item) => item.textContent === "메뉴에서 관리")!
    .click();
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 100));
  await settle();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "구독 관리",
  );
});
