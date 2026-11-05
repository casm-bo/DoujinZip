// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- Test-only UI harnesses. */
import type { Subscription } from "../../../src/types/ipc";
import { afterEach, expect, it, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";
import { createPinia } from "pinia";
const api = vi.hoisted(() => ({
  getSubscriptions: vi.fn(async () => ({
    items: [] as Subscription[],
    errors: {},
  })),
  addSubscription: vi.fn(async () => ({})),
  updateSubscription: vi.fn(async () => ({})),
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

it("saves name-only edits without changing query/languages and applies language removal", async () => {
  api.getSubscriptions.mockResolvedValue({
    items: [
      {
        id: 1,
        query: "language:korean artist:hi_hello",
        normalized_query: "artist:hi_hello language:korean",
        label: "Original",
        enabled: true,
        languages: [],
        last_seen_id: null,
        created_at: "2026-11-05",
        last_checked_at: null,
      },
    ],
    errors: {},
  });
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
  const click = (text: string) =>
    Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
    )
      .find((item) => item.textContent?.trim() === text)!
      .click();
  click("편집");
  await settle();
  click("저장");
  await settle();
  expect(api.updateSubscription).not.toHaveBeenCalled();
  click("편집");
  await settle();
  const name = document.querySelector<HTMLInputElement>(
    'input[placeholder="비우면 검색어 표시"]',
  )!;
  name.value = "Changed";
  name.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
  click("저장");
  await settle();
  expect(api.updateSubscription).toHaveBeenLastCalledWith({
    id: 1,
    label: "Changed",
  });
  click("편집");
  await settle();
  click("전체 언어로 초기화");
  await settle();
  click("저장");
  await settle();
  expect(api.updateSubscription).toHaveBeenLastCalledWith({
    id: 1,
    query: "artist:hi_hello",
    languages: [],
  });
});
