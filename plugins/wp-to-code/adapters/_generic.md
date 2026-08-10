# Adapter: any stack without a file of its own

Used when `target.stack` has no `adapters/<stack>.md`. Covers Nuxt, Svelte, SvelteKit, Vue, React with Vite, Next.js Pages Router, WordPress block themes, and anything else.

There is no adapter file because there does not need to be. The measurement half of this plugin has no opinion about the target, and you already know how to write a component in the stack you are in. Work out these six things from the project you are looking at, then port exactly as the other adapters describe.

## The six things

1. **Where components go.** Follow the convention already in the repo. If the project is empty, use the framework's documented default.
2. **How a component declares props**, and how a parent passes them.
3. **The class attribute name.** `class` everywhere except React and Next, which use `className`.
4. **Loop and conditional syntax.**
5. **How a route is registered.** File-based in most modern frameworks, explicit in the rest.
6. **Where global CSS lives**, and whether the token file is CSS (`@theme` in Tailwind v4) or JS (`tailwind.config.js` in v3).

Write them into `.wp-to-code/config.json` under `target` so the next session does not have to work them out again.

## The rules that do not change per stack

- Measured numbers as arbitrary values. No rounding to the spacing scale.
- **Never build a class name by interpolation.** Tailwind's scanner reads source text, so `` `pl-[${x}px]` ``, `class="pl-[{{ $x }}]"` and `:class="'pl-[' + x + 'px]'"` all produce no CSS and no error. Use an inline style for genuinely dynamic values.
- Props flat and string-keyed, so a CMS repeater's output passes straight through.
- Variation between pages is a prop: padding, container width, row height.
- Confirm the Tailwind content sources cover your component file extension. A missing glob makes every class vanish, which looks exactly like the undefined-token bug.

## Worth checking in your stack

**Image components.** `next/image`, `nuxt-img`, `astro:assets` and friends wrap the element and add their own layout. While matching geometry, use a plain `<img>` with explicit width and height, then swap it in and re-run `/wp-diff` to confirm nothing moved.

**Scoped styles.** Vue SFCs and Svelte scope `<style>` by default. A Tailwind port wants the global sheet.

**Font loaders.** Anything that self-hosts fonts generates its own family name. Reference the CSS variable it exposes, not the family name from the measurement.

**Hydration.** If the framework hydrates, measure the settled page. The plugin's browser layer already waits, but a component that shifts layout on mount will differ between the first paint and the diff.

## If you write a real adapter for this stack

Copy the shape of `next-app.md`: a six-row table, one worked component, and only the notes that bit you. Forty lines. Send it back to the repo.
