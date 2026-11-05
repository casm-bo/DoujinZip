<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useQuery } from "@tanstack/vue-query";
import {
  getSeriesCollections,
  getThumbnailUrl,
  addBookToSeries,
  getBook,
} from "@/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const props = defineProps<{ open: boolean; bookIds: number[] }>();
const emit = defineEmits<{ "update:open": [boolean]; added: [] }>();
const search = ref("");
const sort = ref<"updated_at" | "name" | "book_count">("updated_at");
const page = ref(1);
const busy = ref(false);
const error = ref("");
const target = ref<{ id: number; name: string } | null>(null);
watch([search, sort], () => {
  page.value = 1;
});
watch(
  () => props.open,
  () => {
    target.value = null;
    error.value = "";
  },
);
const { data, isLoading, isError } = useQuery({
  queryKey: computed(() => [
    "seriesCollections",
    "picker",
    search.value,
    sort.value,
    page.value,
  ]),
  queryFn: () =>
    getSeriesCollections({
      page: page.value,
      limit: 30,
      pickerSearch: search.value,
      sortBy: sort.value,
      sortOrder: sort.value === "name" ? "asc" : "desc",
    }),
  enabled: computed(() => props.open),
});
async function add() {
  if (!target.value || busy.value) return;
  const seriesId = target.value.id;
  const ids = [...props.bookIds];
  busy.value = true;
  error.value = "";
  let added = 0;
  try {
    for (const id of ids) {
      const book = await getBook(id);
      if (book?.series_collection_id === seriesId) continue;
      await addBookToSeries(id, seriesId);
      added++;
    }
    emit("added");
    emit("update:open", false);
  } catch (e) {
    error.value = `${added}개 추가 완료. ${(e as Error).message}`;
    if (added) emit("added");
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <Dialog :open="open" @update:open="!busy && emit('update:open', $event)">
    <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-[700px]">
      <DialogHeader
        ><DialogTitle>기존 시리즈에 추가</DialogTitle
        ><DialogDescription
          >선택한 작품을 대상 시리즈로 이동합니다. 기존 시리즈 소속은
          해제됩니다.</DialogDescription
        ></DialogHeader
      >
      <Input
        v-model="search"
        placeholder="시리즈 제목·작가 검색"
        :disabled="busy"
      />
      <select
        v-model="sort"
        aria-label="시리즈 정렬"
        class="rounded border p-2"
        :disabled="busy"
      >
        <option value="updated_at">최근 수정순</option>
        <option value="name">제목순</option>
        <option value="book_count">작품 수순</option>
      </select>
      <p v-if="isLoading">불러오는 중…</p>
      <p v-else-if="isError" role="alert">시리즈를 불러오지 못했습니다.</p>
      <p v-else-if="!data?.collections.length">시리즈가 없습니다.</p>
      <button
        v-for="series in data?.collections"
        :key="series.id"
        type="button"
        class="flex items-center gap-3 rounded border p-2 text-left"
        :class="{ 'border-primary': target?.id === series.id }"
        :aria-pressed="target?.id === series.id"
        :disabled="busy"
        @click="target = series"
      >
        <img
          v-if="series.cover_image"
          :src="getThumbnailUrl(series.cover_image)"
          alt=""
          class="h-20 w-14 rounded object-cover"
        /><span v-else class="bg-muted h-20 w-14 shrink-0 rounded" />
        <span class="min-w-0"
          ><span class="block truncate font-medium">{{ series.name }}</span
          ><span class="text-muted-foreground block text-sm">{{
            series.artists?.join(", ") || "작가 없음"
          }}</span
          ><span class="text-sm">{{ series.book_count }}작품</span></span
        >
      </button>
      <div class="flex justify-between">
        <Button variant="outline" :disabled="busy || page === 1" @click="page--"
          >이전</Button
        ><span>{{ page }}</span
        ><Button
          variant="outline"
          :disabled="busy || !data?.hasNextPage"
          @click="page++"
          >다음</Button
        >
      </div>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
      <Button :disabled="busy || !target || !bookIds.length" @click="add">{{
        target ? `${target.name}에 추가` : "시리즈 선택"
      }}</Button>
    </DialogContent>
  </Dialog>
</template>
