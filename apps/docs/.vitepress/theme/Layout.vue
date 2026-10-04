<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import DefaultTheme from 'vitepress/theme';
import { useData, withBase } from 'vitepress';
const { page, frontmatter } = useData();
const markdown = computed(() => withBase(`/${page.value.relativePath}`));

// VitePress 1.6's local-search overlay uses role="button" around interactive
// controls. Keep its search/focus implementation, but expose the overlay as a
// labelled modal. The overlay is teleported and created only when opened.
let searchObserver: MutationObserver | undefined;
let background: HTMLElement | undefined;
let previousInert = false;
function restoreBackground() {
  if (background) background.inert = previousInert;
  background = undefined;
}
onMounted(() => {
  const labelSearch = () => {
    const overlay = globalThis.document.querySelector('.VPLocalSearchBox');
    if (!overlay) {
      restoreBackground();
      return;
    }
    if (!background) {
      background = globalThis.document.querySelector<HTMLElement>('.Layout') ?? undefined;
      if (background) {
        previousInert = background.inert;
        background.inert = true;
      }
    }
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Search Mimlet documentation');
    for (const attribute of ['aria-labelledby', 'aria-expanded', 'aria-haspopup', 'aria-owns']) {
      overlay.removeAttribute(attribute);
    }
    // The result itself is the option, rather than an option containing a link.
    // Preserve the IDs consumed by VitePress's active-descendant keyboard logic.
    for (const result of overlay.querySelectorAll<HTMLAnchorElement>('a.result')) {
      const row = result.parentElement;
      result.setAttribute('role', 'option');
      result.id = `localsearch-item-${result.dataset.index}`;
      const selected = String(result.classList.contains('selected'));
      if (result.getAttribute('aria-selected') !== selected) {
        result.setAttribute('aria-selected', selected);
      }
      row?.setAttribute('role', 'presentation');
      row?.removeAttribute('aria-selected');
      row?.removeAttribute('id');
    }
    for (const key of overlay.querySelectorAll('kbd[aria-label]')) {
      key.setAttribute('role', 'img');
    }
  };
  searchObserver = new MutationObserver(labelSearch);
  searchObserver.observe(globalThis.document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-selected', 'class', 'data-index'],
  });
  labelSearch();
});
onBeforeUnmount(() => {
  searchObserver?.disconnect();
  restoreBackground();
});
</script>

<template>
  <DefaultTheme.Layout>
    <template #doc-before>
      <div v-if="frontmatter.layout !== 'page'" class="reading-tools">
        <span>Published beta · latest tag</span>
        <a :href="markdown">Read as Markdown <span aria-hidden="true">↗</span></a>
      </div>
    </template>
  </DefaultTheme.Layout>
</template>
