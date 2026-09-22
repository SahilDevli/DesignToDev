# Toster

A 296×88 success toast: a white box with a 4px green border and a centered
message. Use it to confirm that an action (e.g. login) completed.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `message` | `string` | `'Login Successful!'` | Text announced inside the toast. |
| `...rest` | `HTMLAttributes<HTMLDivElement>` | — | Passed to the root `<div>` (e.g. `className`, `id`). |

## Usage

```tsx
import { Toster } from '../components/Toster/Toster';

<Toster message="Login Successful!" />
```

## Variants

- **Toster** (the only variant): `--colors-neutral-100` background, 4px `--colors-tertiary-700` border, 13px radius, 24px medium `--colors-tertiary-700` centered message.

## Assumptions

- **Values with no token:** the 13px radius and 4px border have no matching token in `designToken.css` (radius tokens are 12px/16px; stroke tokens top out at 3px), so they are literal values, as is the 24px message font-size (no font-size tokens exist in the file).
- **Absolute inset → flex centering:** Figma positions the text with an absolute inset (top 28 / right 41 / bottom 29 / left 40 of the 296×88 frame). It is reproduced as `display:flex; align-items:center; justify-content:center` with matching padding, so the message stays centered as it wraps instead of relying on exact pixel offsets.
- **Live region:** Figma shows no interaction or prototype for the toast. Since it is a status message, the root gets `role="status"` and `aria-live="polite"` so screen readers announce it — a conventional accessible pattern, not a Figma-specified state.
- **Responsive (mobile <768px):** the fixed 296px width switches to `100%` so the toast fills a narrower parent instead of overflowing it, and padding switches to `--spacing-8`/`--spacing-9` (20px/24px) instead of the literal 28px/40px. The message font-size uses `clamp(18px, 5vw, 24px)` at all widths so a longer custom `message` never overflows a narrow container. Tablet, laptop, desktop and large screens use the 296px design as-is.
- **Growing box:** `min-height: 88px` instead of a fixed height, so a longer `message` grows the toast instead of being clipped.

## Updates Table

| Date | Discriptsion |
| --- | --- |
| 2026-09-22 | Created Toster from Figma node 488:527. |
