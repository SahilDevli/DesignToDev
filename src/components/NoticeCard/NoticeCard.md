# NoticeCard

A 374×359 cream card that shows a notice: a heading, a paragraph of body copy and a "more" action button in the bottom-right corner.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | `string` | `'Notice 1'` | Heading, rendered as an `<h3>`. |
| `description` | `string` | Figma copy ("These configuration files allow you…") | Body paragraph. |
| `actionLabel` | `string` | `'more'` | Text of the action button. |
| `onAction` | `MouseEventHandler<HTMLButtonElement>` | — | Called when the action button is clicked. |
| `...rest` | `HTMLAttributes<HTMLElement>` | — | Passed to the root `<article>` (e.g. `className`, `aria-label`). |

## Usage

```tsx
import { NoticeCard } from '../components/NoticeCard/NoticeCard';

<NoticeCard
  title="Scheduled maintenance"
  description="The service will be unavailable on Sunday from 02:00 to 04:00 UTC."
  onAction={() => openNotice('maintenance')}
/>
```

## Variants

- **Notice Card** (the only variant): `--colors-neutral-200` background, 13px radius, 24px semibold `--colors-neutral-900` title, 14px medium `--colors-neutral-700` body, primary `Button` bottom-right.

## Assumptions

- **Background as CSS:** Figma draws the card as a vector "Rectangle 1" (flat `#F9F3E1` fill, 13px corners). It is rendered as the root's `background` + `border-radius` instead of an SVG image, so it scales with the content. `#F9F3E1` equals `--colors-neutral-200`.
- **Absolute layout → flex column:** Figma positions children absolutely. The offsets are reproduced as padding (24.5 / 33 / 26.5 / 28px) and margins, and the button is pushed to the bottom with `margin-top: auto`, 8px in from the text's right edge (x 254–333).
- **Text box vs line box:** Figma's title box is 31px; the CSS line box is ~29px, so the gap to the description is 34px instead of 32px to keep the description at y 87.5.
- **Height:** `min-height: 359px` (Figma: fixed 359px). Longer copy grows the card instead of being clipped. The description keeps Figma's 110px box as `min-height`.
- **Width:** `374px` with `max-width: 100%`, so it shrinks in narrower parents and never causes horizontal scroll.
- **Mobile (<768px):** right padding goes from 33px to 28px (matching the left), and the button's extra 8px right margin is removed, so the narrow card uses its width symmetrically. The `Button` itself grows to a 44px touch height at this breakpoint. Tablet, laptop, desktop and large screens use the design as-is.
- **Long words:** title and description use `overflow-wrap: anywhere` so long URLs or keys cannot overflow.
- **Button accessible name:** "more" alone is ambiguous when several cards are on a page, so with the default label the button gets `aria-label="More about {title}"`. A custom `actionLabel` is used as-is.
- **Interaction:** Figma defines no hover/pressed states or prototype interactions for the card. The button's hover, pressed and focus styles come from the reused `Button` component.
- **Values with no token:** 13px radius, 33px / 24.5px / 26.5px padding and 34px gap are literal values; the 28px left padding uses `--spacing-10` and the 8px button margin uses `--spacing-4`.

## Updates Table

| Date | Discriptsion |
| --- | --- |
| 2026-09-22 | Created NoticeCard from Figma node 484:520, reusing Button. |
