# Adapter: Next.js App Router

| | |
| --- | --- |
| Component file | `components/sections/<name>.tsx` |
| Page file | `app/<slug>/page.tsx`, home is `app/page.tsx` |
| Class attribute | `className` |
| Global CSS | `app/globals.css` |
| Dev server | `next dev`, usually `http://localhost:3000` |

## Component

Server components by default. A ported marketing section needs no client JS, so do not add `"use client"` unless the section has state or an event handler.

```tsx
type Event = { title: string; href: string };

export function EventList({
  sub,
  title,
  pad = "py-[100px]",
  events = [],
}: {
  sub?: string;
  title: string;
  pad?: string;
  events?: Event[];
}) {
  return (
    <section className={pad}>
      <div className="mx-auto max-w-[1140px]">
        {sub && <p className="text-13 leading-[15.6px] uppercase">{sub}</p>}
        <h2 className="text-50 leading-[60px]">{title}</h2>

        {events.map((event) => (
          <a key={event.href} href={event.href} className="block h-[558px]">
            {event.title}
          </a>
        ))}
      </div>
    </section>
  );
}
```

## Notes

- Tailwind v4 puts tokens in `app/globals.css` under `@theme`. There is no `tailwind.config.js` to edit.
- `next/image` changes layout: it wraps in a sized span and adds its own styles. While matching geometry, use a plain `<img>` with explicit width and height, and swap it in afterwards with a diff run to confirm nothing moved.
- Never build a class with a template literal: `` className={`pl-[${x}px]`} `` produces no CSS. Use `style={{ paddingLeft: x }}`.
- Fonts loaded through `next/font` get a generated family name. Reference it through the CSS variable it exposes, not by the original family name from the measurement.
