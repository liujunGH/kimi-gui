<script lang="ts">
/**
 * Toast —— 轻提示(全局单例,样式 .proto-toast 在 base.css)
 *
 * 模块级单例状态 + 导出:
 *   import { useToast } from './Toast.vue';
 *   const { toast } = useToast();
 *   toast('已复制路径');
 *
 * 组件本体在壳层(AppShell / 场景根)挂一次即可:show() 后渲染 .proto-toast,
 * 1.4s 后加 .out 渐隐,再 320ms(对齐 base.css 的 opacity transition)后卸载。
 */
import { ref } from 'vue';

const message = ref('');
const leaving = ref(false);
const visible = ref(false);
let fadeTimer: ReturnType<typeof setTimeout> | undefined;
let doneTimer: ReturnType<typeof setTimeout> | undefined;

/** 显示一条轻提示;重复调用替换文案并重置计时。 */
export function show(text: string) {
  message.value = text;
  leaving.value = false;
  visible.value = true;
  clearTimeout(fadeTimer);
  clearTimeout(doneTimer);
  fadeTimer = setTimeout(() => {
    leaving.value = true;
  }, 1400);
  doneTimer = setTimeout(() => {
    visible.value = false;
  }, 1400 + 320);
}

/** 供其他组件调用:const { toast } = useToast() */
export function useToast() {
  return { toast: show };
}
</script>

<script setup lang="ts">
// 渲染模块级单例状态(上方 normal script 与 script setup 同属一个模块作用域,
// 这里起别名只是为了把绑定显式暴露给模板)
const toastMessage = message;
const toastVisible = visible;
const toastLeaving = leaving;
</script>

<template>
  <div v-if="toastVisible" class="proto-toast" :class="{ out: toastLeaving }">
    {{ toastMessage }}
  </div>
</template>
