<script setup lang="ts">
import {
  getPresentation,
  enterSubscriptionTab,
  ipcRenderer,
  refreshSubscriptions,
} from "@/api";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useGallerySelection } from "@/composable/useGallerySelection";
import { isInputFocused } from "@/lib/keybindings/utils";
import { hasOpenDialog } from "@/lib/utils";
import HelpDialog from "@/components/common/HelpDialog.vue"; // HelpDialog 임포트
import SmartSearchInput from "@/components/common/SmartSearchInput.vue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useHitomiLanguages } from "@/composable/useHitomiLanguages";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import WorkViewControls from "../feature/WorkViewControls.vue";
import { useKeybindings } from "@/composable/useKeybindings";
import { useScrollRestoration } from "@/composable/useScrollRestoration";
import { useSearchPersistence } from "@/composable/useSearchPersistence";
import { useDownloadQueueStore } from "@/store/downloadQueueStore";
import { useSubscriptionStore } from "@/store/subscriptionStore";
import { useUiStore } from "@/store/uiStore";
import { Icon } from "@iconify/vue";
import {
  ChevronLeft,
  BellPlus,
  ListChecks,
  RefreshCw,
  Eraser,
  ShieldBan,
} from "lucide-vue-next";
import { applyGalleryPresentation } from "../../../types/presentationGallery";
import { useInfiniteQuery, useQueryClient } from "@tanstack/vue-query";
import type { HitomiGalleryDetails } from "../../../types/hitomi.js";
import { AcceptableValue } from "reka-ui";
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";

const uiStore = useUiStore();
const queryClient = useQueryClient();
const stopPresentationUpdates = ipcRenderer.on(
  "presentation-updated",
  async (key: unknown) => {
    if (typeof key !== "string") return;
    if (!key.startsWith("hitomi:")) return;
    const value = await getPresentation(key).catch(() => null);
    if (!value) return;
    queryClient.setQueriesData<{
      pages: { galleries: HitomiGalleryDetails[]; nextPage?: number }[];
      pageParams: number[];
    }>({ queryKey: ["galleries"] }, (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              galleries: page.galleries.map((gallery) =>
                applyGalleryPresentation(gallery, value),
              ),
            })),
          }
        : old,
    );
    if (selectedGallery.value)
      selectedGallery.value = applyGalleryPresentation(
        selectedGallery.value,
        value,
      );
  },
);

// 썸네일 그리드 줌 스타일
const downloaderGridStyle = computed(() => ({
  zoom: uiStore.thumbnailZoom * 1.5,
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
}));

// Ctrl+Wheel로 썸네일 줌 조절
const handleGridWheel = (event: WheelEvent) => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  if (event.deltaY < 0) {
    uiStore.zoomIn();
  } else {
    uiStore.zoomOut();
  }
};
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import PresetDropdown from "../common/PresetDropdown.vue";
import GalleryPreviewDialog from "../feature/downloader/GalleryPreviewDialog.vue";
import GalleryRowCard from "../feature/downloader/GalleryRowCard.vue";
import GalleryThumbnailCard from "../feature/downloader/GalleryThumbnailCard.vue";
import SubscriptionToolbar from "../feature/downloader/SubscriptionToolbar.vue";

// 검색어 상태
const searchQuery = ref("");
const downloaderLanguage = ref("korean");
type Popularity = "none" | "day" | "week" | "month" | "year";
const downloaderPopularity = ref<Popularity>("none");

const {
  languageOptions,
  error: languageError,
  loading: languagesLoading,
  load: loadLanguages,
} = useHitomiLanguages();
onMounted(loadLanguages);

const popularityOptions = [
  { value: "none", label: "기본순" },
  { value: "day", label: "일간 인기" },
  { value: "week", label: "주간 인기" },
  { value: "month", label: "월간 인기" },
  { value: "year", label: "연간 인기" },
] satisfies { value: Popularity; label: string }[];

const isPopularity = (value: unknown): value is Popularity =>
  popularityOptions.some((option) => option.value === value);

// 뷰 모드 상태 ("grid": 썸네일, "list": 리스트)
const viewMode = ref<"grid" | "list">(
  (localStorage.getItem("downloaderViewMode") as "grid" | "list") || "list",
);

// ToggleGroup의 선택 해제 방지
const handleViewModeChange = (value: AcceptableValue | AcceptableValue[]) => {
  if (
    value &&
    typeof value === "string" &&
    (value === "grid" || value === "list")
  ) {
    viewMode.value = value;
    localStorage.setItem("downloaderViewMode", value);
  }
};

// 각 갤러리 ID별 다운로드 상태를 저장하는 객체
const downloadStatuses = reactive<{
  [key: number]: {
    status: string;
    progress?: number;
    error?: string;
    bookId?: number | null;
  };
}>({});

// 다운로드 큐 store
const downloadQueueStore = useDownloadQueueStore();
const subscriptionStore = useSubscriptionStore();

const searchKey = ref(0); // 검색 트리거를 위한 키
const subscriptionKey = ref(1);
const activeSource = ref<"search" | "subscription">("search");
const blacklistCount = ref(0);
const conditionPanel = ref<"language" | "tags" | null>(null);
const subscriptionToolbar = ref<InstanceType<
  typeof SubscriptionToolbar
> | null>(null);
const subscribeCurrentSearch = () =>
  subscriptionToolbar.value?.openSubscribe(searchQuery.value);
const sourceKey = computed(() =>
  activeSource.value === "subscription"
    ? subscriptionKey.value
    : searchKey.value,
);

// 미리보기 다이얼로그 관련 상태
const isPreviewDialogOpen = ref(false);
const selectedGallery = ref<HitomiGalleryDetails | null>(null);

const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  isError,
  error,
} = useInfiniteQuery({
  queryKey: ["galleries", activeSource, sourceKey],
  queryFn: async ({ pageParam = 1 }) => {
    const finalSearchQuery =
      downloaderLanguage.value !== "all"
        ? `language:${downloaderLanguage.value} ${searchQuery.value}`
        : searchQuery.value;

    const query = {
      searchQuery: finalSearchQuery.trim(),
      offset: 0,
      popularityOrderBy:
        downloaderPopularity.value === "none" ? "" : downloaderPopularity.value,
    };
    const result =
      activeSource.value === "subscription"
        ? await ipcRenderer.invoke("get-subscription-feed", {
            start: (pageParam - 1) * 30,
            count: 30,
          })
        : await ipcRenderer.invoke("search-galleries", {
            query,
            page: pageParam,
          });

    if (result.success && result.data) {
      const galleryDetailsPromises = result.data.map((id: number) =>
        ipcRenderer.invoke("get-gallery-details", id),
      );
      const detailResults = (await Promise.all(galleryDetailsPromises)) as {
        success: boolean;
        data: HitomiGalleryDetails;
      }[];
      return {
        galleries: detailResults
          .filter((res) => res.success)
          .map((res) => res.data),
        nextPage:
          ("hasNextPage" in result && result.hasNextPage) ||
          (result.total !== undefined && pageParam * 30 < result.total)
            ? pageParam + 1
            : undefined,
      };
    } else {
      throw new Error(result.error || "검색 실패");
    }
  },
  getNextPageParam: (lastPage) => lastPage.nextPage,
  initialPageParam: 1,
  enabled: computed(
    () => activeSource.value === "subscription" || searchKey.value > 0,
  ),
});

const allGalleries = computed(() => {
  return data.value?.pages?.flatMap((page) => page.galleries) || [];
});

const {
  selectedIds,
  selected: selectedGalleries,
  clear: clearSelection,
  toggle: toggleSelection,
  selectAll,
  selectContext,
} = useGallerySelection(allGalleries);
watch([activeSource, sourceKey], clearSelection);
const handleGalleryClick = (
  gallery: HitomiGalleryDetails,
  event: MouseEvent,
) => {
  selectedGallery.value = gallery;
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    selectedIds.value.size
  )
    toggleSelection(gallery, event);
  else handleSelectGallery(gallery);
};
const handleSelectionKey = (event: KeyboardEvent) => {
  if (isInputFocused(event) || hasOpenDialog()) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
    event.preventDefault();
    selectAll();
  } else if (event.key === "Escape") clearSelection();
};
onMounted(() => window.addEventListener("keydown", handleSelectionKey));
onUnmounted(() => window.removeEventListener("keydown", handleSelectionKey));
const isBatchDownloading = ref(false);
const downloadSelected = async () => {
  if (isBatchDownloading.value) return;
  const galleries = [...selectedGalleries.value];
  isBatchDownloading.value = true;
  let added = 0;
  try {
    const downloadPath = await ipcRenderer.invoke(
      "get-config-value",
      "downloadPath",
    );
    if (typeof downloadPath !== "string" || !downloadPath)
      throw new Error("다운로드 폴더를 먼저 지정해주세요.");
    for (const gallery of galleries) {
      const status = downloadStatuses[gallery.id]?.status;
      if (status && !["idle", "failed"].includes(status)) continue;
      const existing = await ipcRenderer.invoke(
        "check-book-exists-by-hitomi-id",
        gallery.id,
      );
      if (!existing.success)
        throw new Error(String(existing.error || "보유 여부 확인 실패"));
      if (existing.exists) continue;
      await downloadQueueStore.addToQueue({
        galleryId: gallery.id,
        galleryTitle: gallery.title.display,
        galleryArtist: gallery.artists?.[0],
        thumbnailUrl: gallery.thumbnailUrl,
        downloadPath,
      });
      added++;
    }
    toast.success(`${added}개 작품을 다운로드 큐에 추가했습니다.`);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "큐 추가 실패", {
      description: `${added}개 추가 완료`,
    });
  } finally {
    isBatchDownloading.value = false;
  }
};
const copySelected = async (links: boolean) => {
  try {
    await navigator.clipboard.writeText(
      selectedGalleries.value
        .map((gallery) =>
          links
            ? `https://hitomi.la/galleries/${gallery.id}.html`
            : String(gallery.id),
        )
        .join("\n"),
    );
    toast.success("복사했습니다.");
  } catch {
    toast.error("클립보드 복사 실패");
  }
};

// Intersection Observer 설정
const observerTarget = ref<HTMLElement | null>(null);
const resultScrollRef = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const handleSelectGallery = (gallery: HitomiGalleryDetails) => {
  selectedGallery.value = gallery;
  isPreviewDialogOpen.value = true;
  if (activeSource.value === "subscription")
    void ipcRenderer.invoke("mark-subscription-read", {
      galleryId: gallery.id,
    });
};

const handleBookDeleted = (galleryId: number) => {
  // 삭제된 책의 다운로드 상태 초기화
  delete downloadStatuses[galleryId];
};

// 다운로더 단축키 등록 (미리보기 토글)
useKeybindings("downloader", {
  "downloader:preview-toggle": () => {
    if (selectedGallery.value) {
      isPreviewDialogOpen.value = !isPreviewDialogOpen.value;
    }
  },
});

// 큐 상태를 downloadStatuses에 반영하는 함수
const syncQueueToStatuses = () => {
  // 현재 큐에 있는 갤러리 ID 목록
  const queueGalleryIds = new Set(
    downloadQueueStore.queue.map((item) => item.gallery_id),
  );

  // 큐에서 제거된 상태는 지웁니다. 라이브러리 등록 여부는 각 카드가 별도로 확인합니다.
  Object.keys(downloadStatuses).forEach((galleryIdStr) => {
    const galleryId = Number(galleryIdStr);
    if (!queueGalleryIds.has(galleryId)) {
      delete downloadStatuses[galleryId];
    }
  });

  // 큐에 있는 항목들을 downloadStatuses에 업데이트
  downloadQueueStore.queue.forEach((queueItem) => {
    // 큐의 상태를 downloadStatuses에 매핑
    let mappedStatus: string = queueItem.status;

    // downloading -> progress로 매핑
    if (queueItem.status === "downloading") {
      mappedStatus = "progress";
    }

    const currentStatus = downloadStatuses[queueItem.gallery_id];
    downloadStatuses[queueItem.gallery_id] = {
      status: mappedStatus,
      progress: queueItem.progress,
      error: queueItem.error_message,
      bookId: currentStatus?.bookId,
    };
  });
};

const handleDownloadProgress = (...args: unknown[]) => {
  const { galleryId, status, progress, error, bookId } = args[0] as {
    galleryId: number;
    status: string;
    progress?: number;
    error?: string;
    bookId?: number | null;
  };
  downloadStatuses[galleryId] = {
    status,
    progress,
    error,
    bookId: bookId ?? downloadStatuses[galleryId]?.bookId,
  };

  if (status === "completed") {
    const completedGallery = allGalleries.value.find(
      (gallery) => gallery.id === galleryId,
    );
    if (completedGallery) {
      toast.success(
        `${completedGallery.title.display}이(가) 다운로드되었습니다.`,
      );
    }
  } else if (status === "failed") {
    toast.error("다운로드 실패", {
      description: error || "다운로드 중 오류가 발생했습니다.",
    });
  }
};

const handleDownloadQueueUpdated = () => {
  void downloadQueueStore.fetchQueue().then(syncQueueToStatuses);
};
let stopDownloadProgress = () => {};
let stopDownloadQueueUpdated = () => {};

onMounted(() => {
  // 다운로드 큐 store 초기화
  downloadQueueStore.initialize();

  // 초기 큐 상태 동기화
  syncQueueToStatuses();

  observer = new IntersectionObserver(
    (entries) => {
      if (
        entries[0].isIntersecting &&
        hasNextPage.value &&
        !isFetchingNextPage.value
      ) {
        fetchNextPage();
      }
    },
    {
      threshold: 0.1,
      rootMargin: "0px 0px 800px 0px",
      root: resultScrollRef.value,
    },
  );
  if (observerTarget.value) {
    observer.observe(observerTarget.value);
  }

  // 다운로드 진행 상황 수신
  stopDownloadProgress = ipcRenderer.on(
    "download-progress",
    handleDownloadProgress,
  );

  // 큐 업데이트 이벤트 수신 (큐 상태가 변경되면 downloadStatuses에 반영)
  stopDownloadQueueUpdated = ipcRenderer.on(
    "download-queue-updated",
    handleDownloadQueueUpdated,
  );

  // 저장된 언어 설정 불러오기
  ipcRenderer.invoke("get-config-value", "downloaderLanguage").then((lang) => {
    if (lang) {
      downloaderLanguage.value = lang as string;
    }
  });
  ipcRenderer
    .invoke("get-config-value", "downloaderPopularity")
    .then((popularity) => {
      downloaderPopularity.value = isPopularity(popularity)
        ? popularity
        : "none";
    });
  ipcRenderer.invoke("get-config").then((config) => {
    blacklistCount.value = Array.isArray(config.downloaderBlacklistTags)
      ? config.downloaderBlacklistTags.length
      : 0;
  });
});

onUnmounted(() => {
  stopPresentationUpdates();
  if (observer) {
    observer.disconnect();
  }

  // 큐 store cleanup
  downloadQueueStore.cleanup();
  stopDownloadProgress();
  stopDownloadQueueUpdated();
});

watch(observerTarget, (newTarget) => {
  if (observer) {
    observer.disconnect();
    if (newTarget) {
      observer.observe(newTarget);
    }
  }
});

const handleSearch = async () => {
  activeSource.value = "search";
  resetScroll();
  searchKey.value++;
};

const changeSource = async (source: "search" | "subscription") => {
  if (activeSource.value === source) return;
  conditionPanel.value = null;
  activeSource.value = source;
  selectedGallery.value = null;
  if (source !== "subscription") return;

  await enterSubscriptionTab();
  subscriptionKey.value++;
  await subscriptionStore.refreshStatus();
};

const refreshSubscriptionFeed = async () => {
  await refreshSubscriptions();
  subscriptionKey.value++;
  await subscriptionStore.refreshStatus();
};

const handleSubscriptionsChanged = async () => {
  subscriptionKey.value++;
  await subscriptionStore.refreshStatus();
};

watch(
  () => subscriptionStore.feedGeneration,
  () => {
    if (activeSource.value === "subscription") subscriptionKey.value++;
  },
);

const handleLanguageChange = async (lang: AcceptableValue) => {
  if (!lang) return;
  downloaderLanguage.value = lang as string;
  await ipcRenderer.invoke("set-config", {
    key: "downloaderLanguage",
    value: lang,
  });
  // 언어 변경 시 즉시 검색 다시 실행
  if (searchQuery.value) {
    handleSearch();
  }
};

const handlePopularityChange = async (value: AcceptableValue) => {
  if (!isPopularity(value)) return;
  downloaderPopularity.value = value;
  await ipcRenderer.invoke("set-config", {
    key: "downloaderPopularity",
    value: value === "none" ? "" : value,
  });
  if (searchKey.value > 0) handleSearch();
};

const router = useRouter();

const goToSettings = () => {
  router.push({ path: "/settings", query: { tab: "downloader" } });
};

// 스크롤 위치 복원 (다운로더는 flex-1 사용)
const { resetScroll } = useScrollRestoration(
  "[data-result-scroll]",
  activeSource,
);

// 검색어 저장/복원
useSearchPersistence(searchQuery, "downloader-search-query");
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col gap-3">
    <h1 class="sr-only">검색</h1>
    <div class="flex min-h-0 flex-1 flex-col gap-3">
      <div class="flex shrink-0 flex-col gap-3">
        <div v-if="activeSource === 'search'" class="flex items-center gap-2">
          <SmartSearchInput
            id="search-input"
            v-model="searchQuery"
            class="min-w-0 flex-1"
            placeholder="작품·작가·태그 검색"
            @submit="handleSearch"
          />
          <Button class="min-h-9 rounded-full" @click="handleSearch"
            ><Icon icon="solar:magnifer-linear" class="size-5" />검색</Button
          >
          <Button
            variant="ghost"
            size="icon"
            class="relative"
            aria-label="구독 신작"
            title="구독 신작"
            @click="changeSource('subscription')"
            ><Icon icon="solar:bell-linear" class="size-5" /><span
              v-if="subscriptionStore.hasUnseen"
              class="bg-destructive absolute top-1 right-1 size-2 rounded-full"
          /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child
              ><Button
                variant="ghost"
                size="icon"
                aria-label="검색 더보기"
                title="더보기"
                ><Icon icon="solar:menu-dots-linear" class="size-5" /></Button
            ></DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-64 rounded-xl">
              <DropdownMenuItem
                class="gap-3 px-3 py-2.5"
                :disabled="!searchQuery.trim()"
                @select="subscribeCurrentSearch"
                ><BellPlus class="text-primary mr-1 size-5" />현재 검색
                구독</DropdownMenuItem
              >
              <DropdownMenuItem
                class="gap-3 px-3 py-2.5"
                @select="subscriptionToolbar?.openManager()"
                ><ListChecks class="text-primary mr-1 size-5" />구독
                관리</DropdownMenuItem
              >
              <DropdownMenuItem class="gap-3 px-3 py-2.5" @select="handleSearch"
                ><RefreshCw
                  class="text-primary mr-1 size-5"
                />새로고침</DropdownMenuItem
              >
              <DropdownMenuItem
                class="gap-3 px-3 py-2.5"
                @select="searchQuery = ''"
                ><Eraser class="text-primary mr-1 size-5" />검색어
                지우기</DropdownMenuItem
              >
              <DropdownMenuItem class="gap-3 px-3 py-2.5" @select="goToSettings"
                ><ShieldBan class="text-primary mr-1 size-5" />차단
                태그·다운로드 설정</DropdownMenuItem
              >
            </DropdownMenuContent>
          </DropdownMenu>
          <HelpDialog
            title="다운로더 도움말"
            description="다운로더 사용법 및 검색 팁"
          >
            <template #trigger>
              <Button
                variant="ghost"
                size="icon"
                aria-label="검색 도움말"
                title="검색 도움말"
              >
                <Icon
                  icon="solar:question-circle-bold-duotone"
                  class="h-6 w-6"
                />
              </Button>
            </template>
            <div class="text-muted-foreground space-y-4 text-sm">
              <p>
                이 화면에서는 Hitomi.la에서 작품을 검색하고 다운로드할 수
                있습니다.
              </p>
              <h3 class="text-foreground text-base font-semibold">검색 팁</h3>
              <ul class="list-inside list-disc">
                <li>
                  <Icon
                    icon="solar:global-bold-duotone"
                    class="inline-block h-4 w-4 align-text-bottom"
                  />
                  언어 설정을 통해 검색할 작품의 언어를 지정할 수 있습니다.
                </li>
                <li>
                  <Icon
                    icon="solar:bookmark-bold-duotone"
                    class="inline-block h-4 w-4 align-text-bottom"
                  />
                  버튼을 클릭하여 저장된 프리셋 검색어를 사용할 수 있습니다.
                </li>
                <li><code>id:12345</code>: 특정 갤러리 ID로 검색합니다.</li>
                <li>
                  <code>artist:작가명</code>: 특정 작가의 작품을 검색합니다.
                </li>
                <li>
                  <code>태그명</code>: 특정 태그가 포함된 작품을 검색합니다.
                  (예: <code>female:very_long_hair</code>)
                </li>
                <li>
                  <code>-태그명</code>: 특정 태그를 제외하고 검색합니다. (예:
                  <code>-female:guro</code>)
                </li>
                <li>여러 검색어를 공백으로 구분하여 조합할 수 있습니다.</li>
              </ul>
              <h3 class="text-foreground text-base font-semibold">
                다운로드 관리
              </h3>
              <ul class="list-inside list-disc">
                <li>
                  검색 결과에서 작품을 클릭하여 상세 정보를 확인하고 다운로드할
                  수 있습니다.
                </li>
                <li>다운로드 경로는 설정에서 변경할 수 있습니다.</li>
                <li>
                  다운로드 진행 상황은 각 작품 카드에서 확인할 수 있습니다.
                </li>
              </ul>
              <h3 class="text-foreground text-base font-semibold">미리보기</h3>
              <ul class="list-inside list-disc">
                <li>
                  검색 결과에서 작품을 선택한 후 <kbd>V</kbd> 키를 눌러 미리보기
                  다이얼로그를 열 수 있습니다.
                </li>
              </ul>
              <h3 class="text-foreground text-base font-semibold">
                폴더명 패턴
              </h3>
              <ul class="list-inside list-disc">
                <li>
                  <code>%artist|groups%</code>와 같이 Fallback 문법을 사용할 수
                  있습니다. (artist가 없으면 groups 사용)
                </li>
              </ul>
            </div>
          </HelpDialog>
        </div>
        <div v-else class="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            class="rounded-full"
            aria-label="검색으로 돌아가기"
            title="검색으로 돌아가기"
            @click="changeSource('search')"
            ><ChevronLeft class="size-6"
          /></Button>
          <h2 class="text-2xl font-semibold">구독 신작</h2>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <template v-if="activeSource === 'search'">
            <Button
              variant="outline"
              class="rounded-full"
              :aria-expanded="conditionPanel === 'language'"
              @click="
                conditionPanel =
                  conditionPanel === 'language' ? null : 'language'
              "
              >언어:
              {{
                languageOptions.find(
                  (option) => option.value === downloaderLanguage,
                )?.label || downloaderLanguage
              }}</Button
            >
            <Button
              variant="outline"
              class="rounded-full"
              :aria-expanded="conditionPanel === 'tags'"
              @click="
                conditionPanel = conditionPanel === 'tags' ? null : 'tags'
              "
              >태그 필터</Button
            >
            <div class="w-40 max-w-full min-w-0">
              <PresetDropdown
                v-model="searchQuery"
                @apply-preset="handleSearch"
              />
            </div>
            <Select
              :model-value="downloaderPopularity"
              @update:model-value="handlePopularityChange"
              ><SelectTrigger
                aria-label="검색 정렬"
                class="w-auto min-w-28 rounded-full"
                ><SelectValue /></SelectTrigger
              ><SelectContent
                ><SelectItem
                  v-for="option in popularityOptions"
                  :key="option.value"
                  :value="option.value"
                  >{{ option.label }}</SelectItem
                ></SelectContent
              ></Select
            >
          </template>
          <SubscriptionToolbar
            ref="subscriptionToolbar"
            :class="{ 'w-full': activeSource === 'subscription' }"
            :new-count="subscriptionStore.newCount"
            :last-checked-at="subscriptionStore.lastCheckedAt"
            :language="downloaderLanguage"
            :blacklist-count="blacklistCount"
            @changed="handleSubscriptionsChanged"
            @refresh="refreshSubscriptionFeed"
          />
        </div>
        <div
          v-if="activeSource === 'search' && conditionPanel"
          class="bg-toolbar space-y-2 rounded-xl p-3"
          @keydown.esc.stop="conditionPanel = null"
        >
          <template v-if="conditionPanel === 'language'">
            <p
              v-if="languageError"
              class="text-destructive text-sm"
              role="alert"
            >
              {{ languageError }}
              <Button
                variant="outline"
                size="sm"
                :disabled="languagesLoading"
                @click="loadLanguages"
                >다시 시도</Button
              >
            </p>
            <Label for="language-select">검색 언어</Label>
            <Select
              :model-value="downloaderLanguage"
              @update:model-value="handleLanguageChange"
              ><SelectTrigger id="language-select" class="w-48"
                ><SelectValue /></SelectTrigger
              ><SelectContent
                ><SelectItem
                  v-for="lang in languageOptions"
                  :key="lang.value"
                  :value="lang.value"
                  >{{ lang.label }}</SelectItem
                ></SelectContent
              ></Select
            >
          </template>
          <template v-else>
            <Label>포함·제외 검색 조건</Label>
            <SmartSearchInput
              v-model="searchQuery"
              placeholder="female:sole_female -female:guro"
              @submit="handleSearch"
            />
            <p class="text-muted-foreground text-xs">
              기존 검색 문법으로 조건을 편집합니다. 제외할 태그 앞에는 -를
              붙이세요.
            </p>
            <Button variant="outline" size="sm" @click="goToSettings"
              >차단 태그 설정</Button
            >
          </template>
        </div>
      </div>

      <!-- Right Column: Search Results -->
      <div class="flex min-h-0 flex-1 flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-muted-foreground text-xs font-normal" role="status">
            {{ activeSource === "search" ? "검색 결과" : "구독 피드" }} · 현재
            {{ allGalleries.length }}개 표시
          </h2>
          <div
            v-if="selectedIds.size"
            class="flex flex-wrap items-center gap-2"
            role="toolbar"
            aria-label="선택한 검색 결과"
          >
            <span class="text-sm">{{ selectedIds.size }}개 선택</span>
            <Button
              size="sm"
              :disabled="isBatchDownloading"
              @click="downloadSelected"
              >선택 다운로드</Button
            >
            <Button size="sm" variant="outline" @click="selectAll"
              >전체 선택</Button
            >
            <Button size="sm" variant="ghost" @click="clearSelection"
              >선택 해제</Button
            >
          </div>
          <WorkViewControls
            :view-mode="viewMode"
            :zoom="uiStore.thumbnailZoom"
            @update:view-mode="handleViewModeChange"
            @increase="uiStore.zoomIn()"
            @decrease="uiStore.zoomOut()"
          />
        </div>

        <ContextMenu>
          <ContextMenuTrigger as-child>
            <div
              ref="resultScrollRef"
              data-result-scroll
              class="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-2"
              @wheel="handleGridWheel"
            >
              <div
                v-if="isLoading"
                class="flex h-full items-center justify-center"
              >
                <p class="text-muted-foreground">
                  <Icon icon="svg-spinners:ring-resize" class="size-8" />
                </p>
              </div>
              <div
                v-else-if="isError"
                class="text-destructive flex h-full items-center justify-center"
              >
                <p>오류 발생: {{ error?.message }}</p>
              </div>
              <div v-else-if="allGalleries.length > 0">
                <div
                  v-if="viewMode === 'grid'"
                  class="grid gap-3"
                  :style="downloaderGridStyle"
                >
                  <GalleryThumbnailCard
                    v-for="item in allGalleries"
                    :key="item.id"
                    :gallery="item"
                    :download-status="downloadStatuses[item.id]"
                    :selected="selectedIds.has(item.id)"
                    @select-gallery="handleGalleryClick"
                    @toggle-select="toggleSelection"
                    @context-gallery="selectContext"
                    @preview-gallery="handleSelectGallery"
                    @book-deleted="handleBookDeleted"
                  />
                </div>
                <div v-else class="flex flex-col gap-2">
                  <GalleryRowCard
                    v-for="item in allGalleries"
                    :key="item.id"
                    :gallery="item"
                    :thumbnail-zoom="uiStore.thumbnailZoom"
                    :download-status="downloadStatuses[item.id]"
                    :selected="selectedIds.has(item.id)"
                    @select-gallery="handleGalleryClick"
                    @toggle-select="toggleSelection"
                    @context-gallery="selectContext"
                    @preview-gallery="handleSelectGallery"
                    @book-deleted="handleBookDeleted"
                  />
                </div>
                <div ref="observerTarget" class="h-px"></div>
                <div
                  v-if="isFetchingNextPage"
                  class="text-muted-foreground py-4 text-center"
                >
                  <p>더 많은 결과 불러오는 중...</p>
                </div>
              </div>
              <div v-else class="flex h-full items-center justify-center">
                <p class="text-muted-foreground">
                  {{
                    activeSource === "search"
                      ? searchKey === 0
                        ? "검색어를 입력해 작품을 찾아보세요"
                        : "검색 결과가 없습니다."
                      : "구독한 작품이 없습니다."
                  }}
                </p>
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent class="w-56">
            <ContextMenuLabel>{{ selectedIds.size }}개 선택</ContextMenuLabel>
            <ContextMenuItem
              :disabled="selectedGalleries.length !== 1"
              @select="handleSelectGallery(selectedGalleries[0])"
              >미리보기</ContextMenuItem
            >
            <ContextMenuItem
              :disabled="!selectedIds.size || isBatchDownloading"
              @select="downloadSelected"
              >선택 다운로드</ContextMenuItem
            >
            <ContextMenuSeparator />
            <ContextMenuItem
              :disabled="!selectedIds.size"
              @select="copySelected(true)"
              >링크 복사</ContextMenuItem
            >
            <ContextMenuItem
              :disabled="!selectedIds.size"
              @select="copySelected(false)"
              >갤러리 ID 복사</ContextMenuItem
            >
            <ContextMenuSeparator />
            <ContextMenuItem @select="selectAll">전체 선택</ContextMenuItem>
            <ContextMenuItem
              :disabled="!selectedIds.size"
              @select="clearSelection"
              >선택 해제</ContextMenuItem
            >
          </ContextMenuContent>
        </ContextMenu>
      </div>
    </div>
  </div>

  <GalleryPreviewDialog
    :open="isPreviewDialogOpen"
    :gallery="selectedGallery"
    :download-status="
      selectedGallery ? downloadStatuses[selectedGallery.id]?.status : undefined
    "
    @update:open="isPreviewDialogOpen = $event"
  />
</template>
