<script setup lang="ts">
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useHitomiLanguages } from "@/composable/useHitomiLanguages";
import { computed, onMounted } from "vue";
const model = defineModel<string[]>({ required: true });
const { languages, error, loading, load } = useHitomiLanguages();
const options = computed(() => [
  ...languages.value,
  ...model.value
    .filter((value) => !languages.value.some((item) => item.value === value))
    .map((value) => ({ value, label: value })),
]);
onMounted(load);
</script>
<template>
  <fieldset class="space-y-2">
    <legend class="mb-2 text-sm font-medium">구독 언어</legend>
    <p class="text-muted-foreground text-xs">
      선택하지 않으면 전체 언어. 여러 언어 선택 가능.
    </p>
    <p v-if="error" class="text-destructive text-xs" role="alert">
      {{ error }}
      <Button size="sm" variant="outline" :disabled="loading" @click="load"
        >다시 시도</Button
      >
    </p>
    <div
      class="grid max-h-44 grid-cols-2 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-3"
    >
      <label
        v-for="item in options"
        :key="item.value"
        class="flex items-center gap-2 text-sm"
      >
        <Checkbox
          :model-value="model.includes(item.value)"
          :disabled="!model.includes(item.value) && model.length >= 20"
          @update:model-value="
            model = $event
              ? [...model, item.value]
              : model.filter((value) => value !== item.value)
          "
        />
        {{ item.label }}
      </label>
    </div>
    <Button v-if="model.length" variant="ghost" size="sm" @click="model = []"
      >전체 언어로 초기화</Button
    >
  </fieldset>
</template>
