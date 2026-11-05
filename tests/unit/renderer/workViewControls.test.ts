// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { createApp, h, nextTick, ref, type App } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useUiStore } from "../../../src/renderer/store/uiStore";
import WorkViewControls from "../../../src/renderer/components/feature/WorkViewControls.vue";
let app: App;
afterEach(() => app?.unmount());
it("changes and persists size in list mode and retains it when switching views", async () => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useUiStore(),
    view = ref<"grid" | "list">("list");
  const host = document.createElement("div");
  app = createApp({
    render: () =>
      h(WorkViewControls, {
        viewMode: view.value,
        zoom: store.thumbnailZoom,
        "onUpdate:viewMode": (value: "grid" | "list") => (view.value = value),
        onIncrease: store.zoomIn,
        onDecrease: store.zoomOut,
      }),
  });
  app.mount(host);
  expect(host.textContent).not.toContain("시리즈 묶어보기");
  const find = (label: string) =>
    host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  expect(find("카드 확대").disabled).toBe(false);
  find("카드 확대").click();
  await nextTick();
  expect(store.thumbnailZoom).toBe(1.1);
  expect(localStorage.getItem("thumbnailZoomV2")).toBe("1.1");
  find("썸네일 뷰").click();
  await nextTick();
  expect(view.value).toBe("grid");
  expect(store.thumbnailZoom).toBe(1.1);
  find("리스트 뷰").click();
  find("카드 축소").click();
  await nextTick();
  expect(view.value).toBe("list");
  expect(store.thumbnailZoom).toBe(1);
  store.setThumbnailZoom(1.5);
  await nextTick();
  expect(find("카드 확대").disabled).toBe(true);
  store.setThumbnailZoom(0.4);
  await nextTick();
  expect(find("카드 축소").disabled).toBe(true);
});

it("migrates the old 150% preference to the new 100% baseline", () => {
  localStorage.clear();
  localStorage.setItem("thumbnailZoom", "1.5");
  setActivePinia(createPinia());
  expect(useUiStore().thumbnailZoom).toBe(1);
});
it("prefers new scale settings and rejects invalid saved values", () => {
  localStorage.clear();
  localStorage.setItem("thumbnailZoom", "1.5");
  localStorage.setItem("thumbnailZoomV2", "1.2");
  setActivePinia(createPinia());
  expect(useUiStore().thumbnailZoom).toBe(1.2);
  localStorage.setItem("thumbnailZoomV2", "Infinity");
  setActivePinia(createPinia());
  expect(useUiStore().thumbnailZoom).toBe(1);
});

it("toggles grouping only when the caller supplies the option", async () => {
  const grouped = ref(true);
  const host = document.createElement("div");
  app = createApp({
    render: () =>
      h(WorkViewControls, {
        viewMode: "grid",
        zoom: 1,
        groupSeries: grouped.value,
        "onUpdate:groupSeries": (value: boolean) => {
          grouped.value = value;
        },
      }),
  });
  app.mount(host);
  const button = Array.from(host.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("시리즈 묶어보기"),
  )!;
  expect(button.getAttribute("aria-pressed")).toBe("true");
  button.click();
  await nextTick();
  expect(grouped.value).toBe(false);
  expect(button.getAttribute("aria-pressed")).toBe("false");
});
