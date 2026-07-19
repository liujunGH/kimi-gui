<script setup lang="ts">
/**
 * AppShell —— codex UI 的两栏布局骨架(base.css 的 .app / .app-main)
 *
 * 槽位:
 *   #sidebar        侧栏内容(Sidebar.vue);slot prop: toggleCollapsed()
 *   default         主区内容(toolbar + conversation + dock + 各 pane)
 * 折叠态自管(.sidebar-collapsed),展开按钮由 CSS 兄弟选择器控制显隐。
 */
import { ref } from 'vue';
import CodexIcon from './layout/CodexIcon.vue';

const collapsed = ref(false);
function toggleCollapsed() {
  collapsed.value = !collapsed.value;
}
</script>

<template>
  <div class="app" :class="{ 'sidebar-collapsed': collapsed }">
    <slot name="sidebar" :toggle-collapsed="toggleCollapsed" />
    <main class="app-main">
      <slot />
    </main>
  </div>
  <button class="sidebar-expand-btn" title="展开侧栏" @click="toggleCollapsed">
    <CodexIcon name="panel-left" />
  </button>
</template>
