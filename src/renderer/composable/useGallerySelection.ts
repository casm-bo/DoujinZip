import { computed, ref, type Ref } from "vue";
import { selectBookRange } from "@/components/feature/librarySelection";
import type { HitomiGalleryDetails } from "../../types/hitomi";

export function useGallerySelection(galleries: Ref<HitomiGalleryDetails[]>) {
  const selectedIds = ref(new Set<number>());
  const anchor = ref<number | null>(null);
  const selected = computed(() =>
    galleries.value.filter((item) => selectedIds.value.has(item.id)),
  );
  const clear = () => {
    selectedIds.value = new Set();
    anchor.value = null;
  };
  const toggle = (gallery: HitomiGalleryDetails, event?: MouseEvent) => {
    if (event?.shiftKey && anchor.value !== null) {
      selectedIds.value = selectBookRange(
        galleries.value.map((item) => item.id),
        anchor.value,
        gallery.id,
        selectedIds.value,
      );
    } else {
      const next = new Set(selectedIds.value);
      if (!next.delete(gallery.id)) next.add(gallery.id);
      selectedIds.value = next;
      anchor.value = next.size ? gallery.id : null;
    }
  };
  const selectAll = () => {
    selectedIds.value = new Set(galleries.value.map((item) => item.id));
    anchor.value = galleries.value[0]?.id ?? null;
  };
  const selectContext = (gallery: HitomiGalleryDetails) => {
    if (!selectedIds.value.has(gallery.id)) {
      selectedIds.value = new Set([gallery.id]);
      anchor.value = gallery.id;
    }
  };
  return { selectedIds, selected, clear, toggle, selectAll, selectContext };
}
