import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import { defineAsyncComponent } from 'vue';
import MimletHome from './MimletHome.vue';
import Layout from './Layout.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('MimletHome', MimletHome);
    app.component(
      'ScenarioDemo',
      defineAsyncComponent(() => import('./ScenarioDemo.vue'))
    );
    // Loaded only on the page that uses it. Its runtime is fetched on the first run.
    app.component(
      'MimletSandbox',
      defineAsyncComponent(() => import('./MimletSandbox.vue'))
    );
  },
} satisfies Theme;
