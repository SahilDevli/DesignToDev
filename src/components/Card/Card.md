# Card

A 300×320 content card in three layouts: a Basic text card with a documentation link, an Image card with a header visual and badge, and a Stat card for a headline metric with its trend.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | `'Basic' \| 'Image' \| 'Stat'` | `'Basic'` | Layout variant (Figma "Type"). |
| `title` | `string` | `'Title'` | Heading. In Stat it is the small uppercase label. |
| `description` | `string` | `'Description text'` | Body text. In Stat it is the large metric value. |
| `linkLabel` | `string` | `'View documentation'` | Basic only: link text. |
| `href` | `string` | `'#'` | Basic only: link destination. |
| `onLinkClick` | `MouseEventHandler<HTMLAnchorElement>` | — | Basic only: link click handler. |
| `badge` | `string` | `'Productivity'` | Image only: badge text. |
| `change` | `string` | `'12.4%'` | Stat only: trend figure. |
| `changeLabel` | `string` | `'since last month'` | Stat only: caption beside the trend. |
| `...rest` | `HTMLAttributes<HTMLElement>` | — | Passed to the root `<article>` (e.g. `className`, `aria-label`). |

## Usage

```tsx
import { Card } from '../components/Card/Card';

<Card type="Basic" title="Getting started" description="Set up the project in five minutes." href="/docs" />
<Card type="Image" badge="Productivity" title="Focus mode" description="Silence notifications while you work." />
<Card type="Stat" title="Revenue" description="$48,210" change="12.4%" changeLabel="since last month" />
```

## Variants

- **Basic**: title, description, and a "View documentation →" link at the bottom. Border `--colors-neutral-200`.
- **Image**: 120px gradient header, badge, one-line truncated title, description. Border `#e5e7eb`, content clipped.
- **Stat**: uppercase label, 36px bold value, trend pill (up-right arrow and change) and caption. Border `--colors-primary-700`.

## Assumptions

- **Border drawn as an overlay:** Figma strokes are INSIDE and don't affect layout, so the 1px border is a `::after` overlay. Padding uses Figma's values as-is (24px; Image content 16/20/20px).
- **Height:** Figma fixes the height at 320px. The code uses `min-height: 320px` so longer text grows the card instead of getting cut off. With Figma's content it renders at exactly 320px.
- **Width:** fixed at `300px` as in Figma, plus `max-width: 100%` so the card never overflows a parent narrower than 300px. At 375px and up, the card renders at its full design size at every breakpoint.
- **Mobile (<768px):** the Basic link gets `min-height: 44px` as a touch target. The Stat footer uses `flex-wrap` so the caption drops below the pill instead of overflowing when text is long.
- **Image header:** Figma's `image-placeholder` layer is a gradient fill (`#eef2ff → #c7d2fe`) with no image asset, so it is a decorative `aria-hidden` div.
- **Hard-coded texts made props:** "View documentation", "Productivity", "12.4%" and "since last month" are fixed text in Figma. They are exposed as props that default to the Figma copy.
- **Interaction:** Figma defines no states or prototype interactions. The Basic link is a real `<a>`. It underlines on hover, its arrow moves 2px right, and it shows a focus-visible outline.
- **Colours without a matching token:** `#111827`, `#e5e7eb`, `#eef2ff`, `#c7d2fe`, `#4f46e5`, and shadow `0 4px 12px rgba(0,0,0,0.02)` are used as literal values.
- **Heading level:** titles render as `<h3>`. Change the surrounding structure if a different outline level is needed.

## Updates Table

| Date | Discriptsion |
| --- | --- |
| 2026-09-16 | Initial Card component with Basic, Image and Stat variants from Figma node 5:38. |
