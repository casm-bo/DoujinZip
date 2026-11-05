import { expect, it } from "vitest";
import { ref } from "vue";
import { useGallerySelection } from "../../../src/renderer/composable/useGallerySelection";
import type { HitomiGalleryDetails } from "../../../src/types/hitomi";
it("toggles, extends a stable anchor, preserves right-click selections and clears", () => {
  const items = ref(
    [1, 2, 3, 4, 5].map((id) => ({ id }) as HitomiGalleryDetails),
  );
  const selection = useGallerySelection(items);
  selection.toggle(items.value[1]);
  selection.toggle(items.value[3], { shiftKey: true } as MouseEvent);
  expect([...selection.selectedIds.value]).toEqual([2, 3, 4]);
  selection.toggle(items.value[4], {
    shiftKey: true,
    ctrlKey: true,
  } as MouseEvent);
  expect([...selection.selectedIds.value]).toEqual([2, 3, 4, 5]);
  selection.selectContext(items.value[2]);
  expect(selection.selected.value.map((item) => item.id)).toEqual([2, 3, 4, 5]);
  selection.selectContext(items.value[0]);
  expect([...selection.selectedIds.value]).toEqual([1]);
  selection.selectAll();
  expect(selection.selected.value).toHaveLength(5);
  selection.clear();
  expect(selection.selected.value).toHaveLength(0);
  selection.toggle(items.value[0]);
  selection.toggle(items.value[0]);
  expect(selection.selected.value).toHaveLength(0);
});
