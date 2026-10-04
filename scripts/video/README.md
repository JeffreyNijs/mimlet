# Demo videos

Short, captioned product videos built entirely from SVG and code: no screen capture and
no generated imagery. Every frame is a pure function of time, so a render is reproducible
and a second render of unchanged sources prints the same frame digest.

```sh
pnpm video named-setters             # dist/videos/named-setters.mp4, about 10 s to render
pnpm video named-setters --sheet     # plus a contact sheet every 1.5 s, for review
pnpm video named-setters --frames 4,9.5   # PNG stills only
pnpm video:verify named-setters      # re-run the facts against the published packages
```

Rendering needs `ffmpeg` on `PATH`. Verification installs the exact registry versions a
video names into a temporary project, so it needs network access.

| Video           | Story                                                                  |
| --------------- | ---------------------------------------------------------------------- |
| `named-setters` | A hand-written builder falls behind its schema; `fluent()` replaces it |
| `arktype-rules` | ArkType rejects a hand-written fixture; generated ones satisfy rules   |
| `doctor`        | npm installs an unsupported peer; `mimlet doctor` names the cause      |
| `beta`          | The alpha badge turns beta; fixtures show the beta's generation fixes  |

## How it fits together

- `kit.ts`: palette, frame chrome, captions, code layout, typing, easing and keyframes
- `mascot.ts`: poses the master `scripts/brand/mascot.svg` (gaze, blinks, mouth, hops)
- `audio.ts`: synthesized cues, mixed into a 48 kHz WAV
- `render.ts`: rasterizes frames with the pinned Resvg in worker threads and streams them
  to ffmpeg (H.264 CRF 19, 1080p30, AAC)
- `verify.ts`: checks each video's exported `facts`
- `videos/*.ts`: one timeline per video

Fonts are committed so renders do not depend on the machine: Inter and the no-ligature
JetBrains Mono NL, both under the SIL Open Font License (see `fonts/`). Ligatures stay off
so `<=`, `=>` and `...` look exactly as they are typed.

## House style

- Open on the problem a developer recognizes, then show the step that solves it.
- Organize videos around problems people want to solve, not one per package.
- Whatever moves explains the current step; everything else stays still. Keep it lively,
  but never at the cost of a clear visual story.
- The mascot looks at the most relevant thing. Its eyes never touch the blush; `mascot.ts`
  enforces that.
- Titles and subtitles change together. Change a subtitle on its own only when it explains
  the current animation.
- Captions carry the story, so every video works muted.
- Phone-legible type: code at 30 px or more, supporting text at 24 px or more.
- Values never land on top of other values; a replaced value fades while its replacement
  is in flight.
- Every value, message and terminal line on screen comes from a real run recorded in
  `facts`. Elide long paths or type names with `…` rather than rewording them.
- Keep the sound balance: soft keys and noise, clear pops and chimes, nothing that jumps
  out. Noise reads far louder than a tone at the same level.
- Review the contact sheet and full-size stills yourself before anyone else sees a cut.
