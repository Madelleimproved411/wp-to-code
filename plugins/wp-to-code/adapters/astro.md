# Adapter: Astro

| | |
| --- | --- |
| Component file | `src/components/sections/<Name>.astro` |
| Page file | `src/pages/<slug>.astro`, home is `src/pages/index.astro` |
| Class attribute | `class` |
| Global CSS | `src/styles/global.css` |
| Dev server | `astro dev`, usually `http://localhost:4321` |

The closest target to the original markup, and the best default for a static marketing site: it ships no JS unless you ask for it.

## Component

```astro
---
type Event = { title: string; href: string };

interface Props {
  sub?: string;
  title: string;
  pad?: string;
  events?: Event[];
}

const { sub, title, pad = "py-[100px]", events = [] } = Astro.props;
---

<section class={pad}>
  <div class="mx-auto max-w-[1140px]">
    {sub && <p class="text-13 leading-[15.6px] uppercase">{sub}</p>}
    <h2 class="text-50 leading-[60px]">{title}</h2>

    {events.map((event) => (
      <a href={event.href} class="block h-[558px]">{event.title}</a>
    ))}
  </div>
</section>
```

## Notes

- Astro's dev server runs on 4321 by default, which collides with this plugin's default mirror port. Change one of them in the config.
- Interactive sections need a framework component with a `client:*` directive, or a small inline `<script>`. A ported mobile menu is usually the latter.
- `<style>` blocks in an `.astro` file are scoped by default. For a Tailwind port you want the global sheet, not scoped styles.
- Never interpolate into a class: `class={`pl-[${x}px]`}` produces no CSS. Use `style={`padding-left: ${x}px`}`.
