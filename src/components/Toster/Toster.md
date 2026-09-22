# Toster

A 296×88 toast notification: a white card with a green border and a centered success message. Use it for brief, non-blocking status feedback such as a confirmation after a user action.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `message` | `string` | `'Login Successful!'` | Text shown inside the toast. |
| `...rest` | `HTMLAttributes<HTMLDivElement>` | — | Passed to the root `<div>` (e.g. `className`, `aria-label`). |

## Usage

```tsx
import { Toster } from '../components/Toster/Toster';

<Toster message="Login Successful!" />
```

## Variants

- **Toster** (the only variant): white (`--colors-neutral-100`) background, 4px solid `--colors-tertiary-700` border, 13px radius, centered 24px medium `--colors-tertiary-700` text.

## Assumptions

- **Absolute text inset → flex centering:** Figma positions the message with an absolute inset (31.82% / 13.85% / 32.95% / 13.51% of the 296×88 frame). This is reproduced as `display: flex; align-items: center; justify-content: center` with literal padding instead of matching the percentages exactly.
- **Fixed width, growing height:** width stays `296px` (`max-width: 100%` so it never overflows a narrower parent); height is `min-height: 88px` rather than a fixed height so a longer custom `message` wraps instead of being clipped.
- **No icon or close control:** the Figma node has no icon layer or dismiss button — only a bordered card and text — so none is built. A consuming app is expected to control mount/unmount timing.
- **Responsive:** the design is fixed at 296px with no separate breakpoint variants. Horizontal padding (`clamp(20px, 8vw, 40px)`) and font size (`clamp(18px, 4.5vw, 24px)`) are fluid so the card and its text stay readable and never overflow down to a 375px viewport; the 296px width itself is unchanged since it already fits every target breakpoint.
- **Values with no token:** 4px border width, 13px radius and 40px horizontal padding are literal (no matching `--stroke-*`, `--radius-*` or `--spacing-*` value); `--colors-neutral-100` and `--colors-tertiary-700` are used as-is since they match the Figma variables exactly.
- **Live region:** Figma defines no interaction states for this node, so the component is static; `role="status"` and `aria-live="polite"` are added so assistive tech announces the message when it mounts.

## Updates Table

| Date | Discriptsion |
| --- | --- |
| 2026-09-22 | Created Toster from Figma node 488:527. |
