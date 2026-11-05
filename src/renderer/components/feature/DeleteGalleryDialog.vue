<script setup lang="ts">
import { ref, watch } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { deleteBook } from "@/api";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { toast } from "vue-sonner";
import type { Book } from "../../../types/ipc";
const props = defineProps<{ book: Book | null }>();
const emit = defineEmits<{ close: []; deleted: [] }>();
const busy = ref(false);
const error = ref("");
const client = useQueryClient();
watch(
  () => props.book?.id,
  () => {
    error.value = "";
  },
);
async function remove(permanent: boolean) {
  if (!props.book || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await deleteBook(props.book.id, { permanent });
    await Promise.all([
      client.invalidateQueries({ queryKey: ["books"] }),
      client.invalidateQueries({ queryKey: ["seriesCollection"] }),
      client.invalidateQueries({ queryKey: ["seriesCollections"] }),
    ]);
    toast.success("갤러리를 삭제했습니다.");
    emit("deleted");
    emit("close");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <AlertDialog :open="!!book" @update:open="!$event && !busy && emit('close')">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>갤러리 삭제</AlertDialogTitle>
        <AlertDialogDescription
          >{{ book?.title }} — 선택한 작품 하나의 실제 파일과 라이브러리 정보를
          삭제합니다. 영구 삭제는 되돌릴 수 없습니다.</AlertDialogDescription
        >
      </AlertDialogHeader>
      <p v-if="error" role="alert" class="text-destructive text-sm">
        {{ error }}
      </p>
      <AlertDialogFooter>
        <Button variant="outline" :disabled="busy" @click="emit('close')"
          >취소</Button
        >
        <Button variant="outline" :disabled="busy" @click="remove(false)"
          >휴지통으로 이동</Button
        >
        <Button variant="destructive" :disabled="busy" @click="remove(true)"
          >영구 삭제</Button
        >
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
