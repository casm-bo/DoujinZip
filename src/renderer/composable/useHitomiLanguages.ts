import { ipcRenderer } from "@/api";
import { LANGUAGE_OPTIONS } from "@/lib/subscriptionQuery";
import { computed, ref } from "vue";

const languages = ref(LANGUAGE_OPTIONS.filter((item) => item.value !== "all"));
const error = ref("");
const loading = ref(false);
let loadedAt = 0;

export function useHitomiLanguages() {
  const load = async () => {
    if (loading.value || Date.now() - loadedAt < 24 * 60 * 60 * 1000) return;
    loading.value = true;
    error.value = "";
    try {
      const result = await ipcRenderer.invoke("get-hitomi-languages");
      if (!result.success || !result.data)
        throw new Error(result.error || "언어 목록을 가져오지 못했습니다.");
      languages.value = result.data;
      loadedAt = Date.now();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  };
  return {
    languages,
    languageOptions: computed(() => [LANGUAGE_OPTIONS[0], ...languages.value]),
    error,
    loading,
    load,
  };
}
