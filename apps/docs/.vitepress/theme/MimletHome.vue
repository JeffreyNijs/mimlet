<script setup lang="ts">
import { useData, withBase } from 'vitepress';
import {
  agentBenefits,
  alphaStatus,
  demo,
  feedbackUrl,
  identity,
  quickstart,
  stories,
} from '../../content';
import { heroHtml, quickstartHtml } from '../../.generated/hero';
const { theme, isDark } = useData();
</script>

<template>
  <main id="main-content" class="mimlet-home">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow"><span class="status-dot" /> A little mimic. A lot of possibility.</p>
        <h1 id="hero-title">Test data,<br />with <span>character.</span></h1>
        <p class="hero-deck">{{ identity.description }}</p>
        <p class="hero-intro">{{ identity.introduction }}</p>
        <div class="hero-actions">
          <a class="button primary" :href="withBase('/guide/getting-started.html')"
            >Meet Mimlet <span aria-hidden="true">↗</span></a
          >
          <a class="button secondary" :href="withBase('/guide/try-it.html')"
            >Try it in your browser <span aria-hidden="true">↗</span></a
          >
          <a class="button secondary" :href="theme.socialLinks?.[0]?.link"
            >Explore the source <span aria-hidden="true">↗</span></a
          >
        </div>
        <p class="release-note">
          {{ identity.releaseStatus }} · {{ identity.releaseVersion }}<br />Available on npm’s next
          channel.
        </p>
      </div>
      <div class="hero-stage">
        <div class="stage-grid" aria-hidden="true" />
        <img
          class="hero-mascot"
          :src="withBase(isDark ? '/brand/mark-dark.svg' : '/brand/mark.svg')"
          alt="Mimlet, a mint folded-corner creature with little feet"
          width="148"
          height="120"
        />
        <div class="code-window">
          <div class="window-bar">
            <span class="window-dots" aria-hidden="true"><i /><i /><i /></span
            ><span>your-next-test.ts</span><span class="code-language">TS</span>
          </div>
          <!-- Generated from an executable, typechecked recipe; no user HTML enters this value. -->
          <div class="hero-code" v-html="heroHtml" />
          <div class="fixture-output">
            <span aria-hidden="true">↳</span><code>{ id: 'user-1', role: 'admin' }</code
            ><span class="valid-label">validated</span>
          </div>
        </div>
        <span class="stage-note" aria-hidden="true">a fixture with a familiar face</span>
      </div>
    </section>

    <section class="demo" aria-labelledby="demo-title">
      <div class="demo-heading">
        <p class="eyebrow">See it catch a bug</p>
        <h2 id="demo-title">{{ demo.title }}</h2>
      </div>
      <div class="demo-grid">
        <figure class="demo-media">
          <video
            class="demo-video"
            controls
            muted
            playsinline
            loop
            preload="metadata"
            width="1920"
            height="1080"
            :poster="withBase(`/${demo.poster}`)"
            :aria-label="demo.label"
            aria-describedby="demo-summary"
          >
            <source :src="withBase(`/${demo.video}`)" type="video/mp4" />
            <p>
              Your browser cannot play this video.
              <a :href="withBase(`/${demo.video}`)"
                >Download the checkout demo (MP4, {{ demo.size }})</a
              >.
            </p>
          </video>
          <figcaption>
            <p id="demo-summary">{{ demo.summary }}</p>
            <p class="demo-credit">{{ demo.credit }}</p>
            <p class="demo-meta">
              {{ demo.duration }} · on-screen captions · sound cues only, starts muted ·
              <a :href="withBase(`/${demo.video}`)">Open the MP4 ({{ demo.size }})</a>
            </p>
            <p class="demo-links">
              <a class="text-link" :href="withBase('/guide/checkout-example.html')"
                >Read the tested example <span aria-hidden="true">↗</span></a
              >
              <a class="text-link" :href="withBase('/guide/checkout-comparison.html')"
                >Compare with plain fast-check <span aria-hidden="true">↗</span></a
              >
            </p>
          </figcaption>
        </figure>
        <div class="quickstart" aria-labelledby="quickstart-title">
          <h3 id="quickstart-title">Quickstart with Zod</h3>
          <ol class="quickstart-steps">
            <li>
              <span class="step-label">Install the beta</span>
              <pre class="quickstart-command"><code>{{ quickstart.install }}</code></pre>
            </li>
            <li>
              <span class="step-label">Save as <code>fixture.mts</code></span>
              <!-- Generated from an executable, typechecked recipe; no user HTML enters this value. -->
              <div class="quickstart-code" v-html="quickstartHtml" />
            </li>
            <li>
              <span class="step-label"
                >Add <code>console.log(input, user)</code>, then run on Node 22.18+</span
              >
              <pre class="quickstart-command"><code>{{ quickstart.run }}</code></pre>
              <div class="fixture-output quickstart-output">
                <span aria-hidden="true">↳</span><code>{{ quickstart.output }}</code>
              </div>
            </li>
          </ol>
          <p class="alpha-status">
            <span class="status-dot" aria-hidden="true" />{{ alphaStatus }}
          </p>
          <div class="quickstart-actions">
            <a class="button primary" :href="feedbackUrl"
              >Send beta feedback <span aria-hidden="true">↗</span></a
            >
            <a class="text-link" :href="withBase('/guide/beta-feedback.html')"
              >Two short tasks to try first <span aria-hidden="true">↗</span></a
            >
          </div>
        </div>
      </div>
    </section>

    <section class="ecosystem" aria-label="Schema ecosystems">
      <span class="ecosystem-label">At home with your schemas</span>
      <ul>
        <li>TypeBox</li>
        <li>Zod</li>
        <li>Valibot</li>
        <li>ArkType</li>
        <li>Effect</li>
        <li>JSON Schema</li>
      </ul>
      <a :href="withBase('/guide/adapters.html')"
        >See each integration’s capabilities <span aria-hidden="true">→</span></a
      >
    </section>

    <section class="stories" aria-labelledby="stories-title">
      <div class="section-heading">
        <p class="eyebrow">Small fixtures. Bigger stories.</p>
        <h2 id="stories-title">Make the data part<br />the easy part.</h2>
        <p>
          From one object to a whole test world, keep the pieces you care about under your control.
        </p>
      </div>
      <article v-for="story in stories" :key="story.number" class="story">
        <div class="story-art">
          <img
            :src="withBase(`/brand/${story.illustration}`)"
            alt=""
            width="640"
            height="360"
            loading="lazy"
          />
        </div>
        <div class="story-copy">
          <span class="story-number">{{ story.number }} /</span>
          <h3>{{ story.title }}</h3>
          <p>{{ story.description }}</p>
          <a class="text-link" :href="withBase(`${story.link}.html`)"
            >{{ story.action }} <span aria-hidden="true">↗</span></a
          >
        </div>
      </article>
    </section>

    <section class="toolkit" aria-labelledby="toolkit-title">
      <div>
        <p class="eyebrow">Bring just what you need</p>
        <h2 id="toolkit-title">A small core.<br />Room to grow.</h2>
        <p>
          The builder core has no runtime dependencies. Add generation, protocols, property testing,
          or a local playground when the job calls for them.
        </p>
      </div>
      <div class="package-shelf" aria-label="Toolkit packages">
        <span class="package-core">@mimlet/core <small>the core</small></span
        ><span>@mimlet/typebox</span><span>@mimlet/zod</span><span>@mimlet/arktype</span
        ><span>@mimlet/fast-check</span><span>@mimlet/graphql</span><span>@mimlet/codegen</span
        ><span>hey-api-builders</span
        ><a :href="withBase('/guide/adapters.html')"
          >Explore all 19 packages <span aria-hidden="true">↗</span></a
        >
      </div>
    </section>

    <section class="agents" aria-labelledby="agents-title">
      <div class="agent-intro">
        <p class="eyebrow">For coding agents, too</p>
        <h2 id="agents-title">Good context.<br /><span>Better fixtures.</span></h2>
        <p>
          Give your coding agent a clear starting point: real APIs, working recipes, and the
          boundaries that matter.
        </p>
        <a class="button mint" :href="withBase('/guide/agents.html')"
          >Open the agent guide <span aria-hidden="true">↗</span></a
        >
      </div>
      <div class="agent-benefits">
        <div v-for="[title, description] in agentBenefits" :key="title">
          <h3>{{ title }}</h3>
          <p>{{ description }}</p>
        </div>
        <a :href="withBase('/llms.txt')">Read llms.txt <span aria-hidden="true">→</span></a>
      </div>
    </section>

    <footer class="home-footer">
      <img
        :src="withBase(isDark ? '/brand/mark-dark.svg' : '/brand/mark.svg')"
        alt=""
        width="70"
        height="57"
      />
      <div>
        <strong>Give your next test some character.</strong>
        <p>Mimlet · MIT licensed · Made by Jeffrey Nijs</p>
      </div>
      <a :href="withBase('/guide/getting-started.html')"
        >Get started <span aria-hidden="true">↗</span></a
      >
    </footer>
  </main>
</template>
