<script setup lang="ts">
import * as api from "@/api";
import SmartSearchInput from "@/components/common/SmartSearchInput.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useHitomiLanguages } from "@/composable/useHitomiLanguages";
import SubscriptionLanguages from "./SubscriptionLanguages.vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { nextTick } from "vue";
import { Switch } from "@/components/ui/switch";
import { useSubscriptionStore } from "@/store/subscriptionStore";
import {
  languageLabel,
  sortSubscriptions,
  type SubscriptionSort,
  splitLanguage,
  withLanguage,
} from "@/lib/subscriptionQuery";
import { Icon } from "@iconify/vue";
import { computed, onMounted, ref, watch } from "vue";
import { toast } from "vue-sonner";
import type { Subscription } from "../../../../types/ipc";

const props = defineProps<{
  newCount: number;
  lastCheckedAt: string | null;
  /** 추가할 검색어 앞에 붙일 언어. 툴바 필터에서 고른 값 */
  language: string;
  /** 차단 태그 개수. 구독 폴링에도 걸리므로 팝오버에서 알려준다 */
  blacklistCount: number;
}>();

const emit = defineEmits<{
  /** 구독 목록이 바뀌어 피드를 다시 조회해야 할 때 */
  (event: "changed"): void;
  /** 수동 새로고침 */
  (event: "refresh"): void;
}>();

const isOpen = ref(false);
const { languageOptions: LANGUAGE_OPTIONS, load: loadLanguages } =
  useHitomiLanguages();
onMounted(loadLanguages);
const subscriptionStore = useSubscriptionStore();
const isLoading = ref(false);
const isAdding = ref(false);
const isRefreshing = ref(false);

/**
 * 켜고 끄기·삭제를 처리 중인 구독 id.
 *
 * 둘 다 메인에서 폴링 사이클을 돌고 오느라 몇 초 걸린다(실측 약 2초).
 * 그동안 다른 행까지 잠가 사이클이 겹쳐 쌓이는 것을 막는다.
 */
const pendingId = ref<number | null>(null);
const isBusy = computed(() => pendingId.value !== null);
const subscriptions = ref<Subscription[]>([]);
const errors = ref<Record<number, string>>({});
const newQuery = ref("");
const newLabel = ref("");
const isCreateOpen = ref(false);
const newLanguage = ref("all");
const sort = ref<SubscriptionSort>("newest");

/** 고치는 중인 구독 id */
const editingId = ref<number | null>(null);
const editingQuery = ref("");
const editingLabel = ref("");
const editingLanguages = ref<string[]>([]);
const isSaving = ref(false);

const lastCheckedText = computed(() => {
  if (!props.lastCheckedAt) return "확인한 적 없음";
  return new Date(props.lastCheckedAt).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
});

const composedQuery = computed(() =>
  withLanguage(newLanguage.value, newQuery.value),
);

const canAdd = computed(
  () => newQuery.value.trim().length > 0 && !isAdding.value,
);

/** 모든 줄이 `language:korean`으로 시작하지 않도록 언어를 떼어 따로 보여준다 */
const rows = computed(() =>
  sortSubscriptions(subscriptions.value, sort.value).map((subscription) => {
    const { language, rest } = splitLanguage(subscription.query);
    return {
      subscription,
      language: subscription.languages?.length
        ? subscription.languages.map(languageLabel).join(", ")
        : language
          ? languageLabel(language)
          : null,
      // 언어만으로 이뤄진 구독이면 뗄 게 없어 원문을 그대로 쓴다
      queryText: rest || subscription.query,
      error: errors.value[subscription.id],
    };
  }),
);

let loadRevision = 0;
const load = async () => {
  const request = ++loadRevision;
  isLoading.value = true;
  try {
    const result = await api.getSubscriptions();
    if (request !== loadRevision) return;
    subscriptions.value = result.items;
    errors.value = result.errors;
  } catch (err) {
    if (request !== loadRevision) return;
    toast.error(
      err instanceof Error ? err.message : "구독 목록을 불러오지 못했습니다.",
    );
  } finally {
    if (request === loadRevision) isLoading.value = false;
  }
};

// 자동완성이 Enter를 먼저 가로채 후보를 채운다. 타입만 채운 상태("artist:")면
// 아직 검색어가 아니라서 이름을 더 받는다
const handleEnter = () => {
  if (newQuery.value.trim().endsWith(":")) return;
  void handleAdd();
};

const handleAdd = async () => {
  if (!canAdd.value) return;

  // 메인이 구독 전체를 한 바퀴 돌며 기준선을 잡고 오기 때문에 몇 초 걸린다
  isAdding.value = true;
  try {
    await api.addSubscription({
      query: composedQuery.value,
      label: newLabel.value,
    });
    isCreateOpen.value = false;
    newQuery.value = "";
    toast.success("구독에 추가했습니다.");
    await load();
    emit("changed");
  } catch (err) {
    toast.error(
      err instanceof Error ? err.message : "구독을 추가하지 못했습니다.",
    );
  } finally {
    isAdding.value = false;
  }
};

const handleRemove = async (subscription: Subscription) => {
  pendingId.value = subscription.id;
  try {
    await api.removeSubscription(subscription.id);
    await load();
    emit("changed");
  } catch (err) {
    toast.error(
      err instanceof Error ? err.message : "구독을 삭제하지 못했습니다.",
    );
  } finally {
    pendingId.value = null;
  }
};

const handleToggle = async (subscription: Subscription, enabled: boolean) => {
  pendingId.value = subscription.id;
  try {
    await api.updateSubscription({ id: subscription.id, enabled });
    await load();
    emit("changed");
  } catch (err) {
    toast.error(
      err instanceof Error ? err.message : "구독을 수정하지 못했습니다.",
    );
  } finally {
    pendingId.value = null;
  }
};

// 언어는 별도 선택기로 편집한다.
const startEditing = (subscription: Subscription) => {
  editingId.value = subscription.id;
  const { language, rest } = splitLanguage(subscription.query);
  editingQuery.value = rest || subscription.query;
  editingLabel.value = subscription.label ?? "";
  editingLanguages.value = subscription.languages?.length
    ? [...subscription.languages]
    : language
      ? [language]
      : [];
};

const cancelEditing = () => {
  editingId.value = null;
};

// 추가 칸과 같은 이유로 막는다
const handleEditEnter = () => {
  if (editingQuery.value.trim().endsWith(":")) return;
  void commitEditing();
};

const commitEditing = async () => {
  const id = editingId.value;
  if (id === null || isSaving.value) return;

  const target = subscriptions.value.find(
    (subscription) => subscription.id === id,
  );
  const original = splitLanguage(target?.query ?? "");
  const originalLanguages = target?.languages?.length
    ? target.languages
    : original.language
      ? [original.language]
      : [];
  const languagesChanged =
    JSON.stringify([...editingLanguages.value].sort()) !==
    JSON.stringify([...originalLanguages].sort());
  let query = editingQuery.value.trim();
  if (languagesChanged) {
    query = splitLanguage(query).rest;
    if (!query && editingLanguages.value.length)
      query = `language:${editingLanguages.value[0]}`;
  }

  if (!query) {
    toast.error("검색어가 비어 있습니다.");
    return;
  }

  // 바뀐 것만 보낸다. 검색어를 그대로 둔 저장까지 폴링 사이클을 돌 이유는 없다
  const params: {
    id: number;
    query?: string;
    label?: string;
    languages?: string[];
  } = { id };
  if (languagesChanged || query !== (original.rest || target?.query)) {
    params.languages = [...editingLanguages.value];
    params.query = query;
  }
  if (editingLabel.value !== (target?.label ?? "")) {
    params.label = editingLabel.value;
  }

  if (
    params.query === undefined &&
    params.label === undefined &&
    params.languages === undefined
  ) {
    editingId.value = null;
    return;
  }

  isSaving.value = true;
  try {
    await api.updateSubscription(params);
    editingId.value = null;
    await load();
    // 검색어가 바뀌면 피드 구성이 달라진다
    if (params.query !== undefined || params.languages !== undefined)
      emit("changed");
  } catch (err) {
    // 검증 실패·중복이면 고칠 수 있게 편집 상태를 그대로 둔다
    toast.error(
      err instanceof Error ? err.message : "구독을 수정하지 못했습니다.",
    );
  } finally {
    isSaving.value = false;
  }
};

const markAllRead = async () => {
  const result = await api.ipcRenderer.invoke("mark-subscription-read", {});
  if (!result.success) {
    toast.error(result.error ?? "읽음 처리 실패");
    return;
  }
  emit("changed");
};
const handleRefresh = async () => {
  isRefreshing.value = true;
  try {
    emit("refresh");
    await load();
  } finally {
    isRefreshing.value = false;
  }
};

onMounted(load);
watch(() => subscriptionStore.revision, load);
const openManager = async () => {
  await nextTick();
  isOpen.value = true;
  void load();
};
const openSubscribe = async (query = "") => {
  const parsed = splitLanguage(query);
  newQuery.value = parsed.rest || query;
  newLanguage.value = parsed.language || props.language;
  newLabel.value = "";
  await nextTick();
  isCreateOpen.value = true;
};
defineExpose({ openManager, openSubscribe });
</script>

<template>
  <div class="flex min-w-0 flex-wrap items-center gap-2">
    <Button variant="outline" @click="openManager"
      ><Icon icon="solar:feed-bold-duotone" class="size-4" />구독 관리
      <span class="text-muted-foreground text-xs">{{
        subscriptions.length
      }}</span></Button
    >
    <Button
      variant="secondary"
      size="icon"
      :disabled="isRefreshing"
      title="지금 확인"
      @click="handleRefresh"
      ><Icon
        icon="solar:refresh-bold-duotone"
        class="size-5"
        :class="{ 'animate-spin': isRefreshing }"
    /></Button>
    <span v-if="newCount > 0" class="text-sm font-medium"
      >신작 {{ newCount }}건</span
    >
    <Button
      variant="outline"
      class="ml-auto"
      size="sm"
      :disabled="newCount === 0"
      @click="markAllRead"
      >모두 읽음</Button
    >

    <Dialog v-model:open="isOpen">
      <DialogContent
        class="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-3xl"
      >
        <DialogHeader
          ><DialogTitle>구독 관리</DialogTitle
          ><DialogDescription
            >등록한 검색어의 신작을 앱이 켜져 있는 동안 1시간마다
            확인합니다.</DialogDescription
          ></DialogHeader
        >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <Button @click="openSubscribe()">새 구독 추가</Button>
          <Select v-model="sort"
            ><SelectTrigger class="w-40" aria-label="구독 정렬"
              ><SelectValue /></SelectTrigger
            ><SelectContent>
              <SelectItem value="newest">최근 추가순</SelectItem
              ><SelectItem value="oldest">오래된순</SelectItem
              ><SelectItem value="name">이름순</SelectItem
              ><SelectItem value="enabled">활성 구독 먼저</SelectItem>
            </SelectContent></Select
          >
        </div>
        <p v-if="isLoading" class="text-muted-foreground text-sm" role="status">
          불러오는 중...
        </p>
        <p
          v-if="rows.length === 0 && !isLoading"
          class="text-muted-foreground py-10 text-center"
        >
          구독한 검색어가 없습니다.
        </p>
        <ul v-else class="min-h-0 space-y-3 overflow-y-auto p-1">
          <li
            v-for="row in rows"
            :key="row.subscription.id"
            class="bg-card border-foreground/50 space-y-3 rounded-xl border-2 p-4"
          >
            <template v-if="editingId === row.subscription.id">
              <label class="block space-y-2 text-sm font-medium"
                ><span>표시 이름</span
                ><Input v-model="editingLabel" placeholder="비우면 검색어 표시"
              /></label>
              <div class="space-y-2">
                <p class="text-sm font-medium">검색 조건</p>
                <SmartSearchInput
                  v-model="editingQuery"
                  placeholder="artist:작가명 tag:태그"
                  :show-actions="false"
                  @submit="handleEditEnter"
                />
              </div>
              <SubscriptionLanguages v-model="editingLanguages" />
              <div class="flex justify-end gap-2">
                <Button
                  variant="outline"
                  :disabled="isSaving"
                  @click="cancelEditing"
                  >취소</Button
                ><Button
                  :disabled="isSaving || !editingQuery.trim()"
                  @click="commitEditing"
                  >{{ isSaving ? "저장 중..." : "저장" }}</Button
                >
              </div>
            </template>
            <template v-else>
              <div class="flex items-start gap-3">
                <Switch
                  :model-value="row.subscription.enabled"
                  :disabled="isBusy || isSaving"
                  aria-label="구독 활성화"
                  @update:model-value="handleToggle(row.subscription, $event)"
                />
                <div class="min-w-0 flex-1 space-y-1">
                  <p
                    class="text-sm font-semibold break-words"
                    :class="{
                      'text-muted-foreground': !row.subscription.enabled,
                    }"
                  >
                    {{ row.subscription.label || row.queryText }}
                  </p>
                  <p
                    v-if="row.subscription.label"
                    class="text-muted-foreground text-xs break-words"
                  >
                    {{ row.queryText }}
                  </p>
                  <Badge variant="secondary" class="whitespace-normal">{{
                    row.language || "전체 언어"
                  }}</Badge>
                  <p
                    v-if="row.error"
                    class="text-destructive text-xs break-words"
                    :title="row.error"
                  >
                    확인 실패 · 다음 확인에 다시 시도
                  </p>
                </div>
                <div class="flex shrink-0 flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="isBusy || isSaving"
                    @click="startEditing(row.subscription)"
                    >편집</Button
                  >
                  <Button
                    variant="ghost"
                    size="sm"
                    :disabled="isBusy || isSaving"
                    @click="handleRemove(row.subscription)"
                    >{{
                      pendingId === row.subscription.id ? "처리 중..." : "삭제"
                    }}</Button
                  >
                </div>
              </div>
            </template>
          </li>
        </ul>
        <p class="text-muted-foreground border-t pt-3 text-xs">
          마지막 확인: {{ lastCheckedText
          }}<span v-if="blacklistCount">
            · 차단 태그 {{ blacklistCount }}개 적용</span
          >
        </p>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="isCreateOpen">
      <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader
          ><DialogTitle>검색 구독하기</DialogTitle
          ><DialogDescription
            >이름과 검색 조건을 확인한 뒤 구독하세요.</DialogDescription
          ></DialogHeader
        >
        <label class="space-y-2 text-sm font-medium"
          ><span>표시 이름</span
          ><Input v-model="newLabel" placeholder="비우면 검색어 표시"
        /></label>
        <div class="space-y-2">
          <p class="text-sm font-medium">검색 조건</p>
          <SmartSearchInput
            v-model="newQuery"
            placeholder="artist:작가명 tag:태그"
            :show-actions="false"
            @submit="handleEnter"
          />
        </div>
        <label class="space-y-2 text-sm font-medium"
          ><span>언어</span
          ><Select v-model="newLanguage"
            ><SelectTrigger aria-label="새 구독 언어"
              ><SelectValue /></SelectTrigger
            ><SelectContent
              ><SelectItem
                v-for="item in LANGUAGE_OPTIONS"
                :key="item.value"
                :value="item.value"
                >{{ item.label }}</SelectItem
              ></SelectContent
            ></Select
          ></label
        >
        <p class="text-muted-foreground text-xs">
          태그 조건의 신작을 확인합니다. 차단 태그 {{ blacklistCount }}개도
          적용됩니다.
        </p>
        <div class="flex justify-end gap-2">
          <Button
            variant="outline"
            :disabled="isAdding"
            @click="isCreateOpen = false"
            >취소</Button
          ><Button :disabled="!canAdd" @click="handleAdd">{{
            isAdding ? "등록 중..." : "구독하기"
          }}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
