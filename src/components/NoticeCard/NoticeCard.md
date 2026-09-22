# NoticeCard

A cream notice panel with a heading, body text and a bottom-right "more" action (reuses `Button`). Built from Figma node `484:520` (374×359).

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | `string` | `'Notice 1'` | Notice heading (also the card's accessible name). |
| `description` | `string` | Figma body copy | Notice body text. |
| `actionLabel` | `string` | `'more'` | Visible label of the action button. |
| `onAction` | `MouseEventHandler<HTMLButtonElement>` | — | Fired when the action button is clicked. |
| `...rest` | `HTMLAttributes<HTMLElement>` | — | Spread onto the root `<article>` (`className` is merged). |

## Usage

```tsx
import { NoticeCard } from '../components/NoticeCard/NoticeCard';

<NoticeCard
  title="Scheduled maintenance"
  description="The service will be unavailable on Sunday between 02:00 and 04:00 UTC."
  onAction={() => openNotice('maintenance')}
/>;
```

## Variants

- **Notice Card** — the only variant (no Figma variant properties). Story: `NoticeCardDefault`.

Interaction comes from `Button`: hover darkens it, pointer-down scales it, `:focus-visible` shows a focus ring.

## Assumptions

- **Background** — Figma's "Rectangle 1" vector is a plain rounded rectangle (`#F9F3E1`, radius 13). It's drawn with CSS (`--colors-neutral-200`, `border-radius: 13px`) instead of the exported SVG so it scales with the container without distorting the corners. No SVG is shipped.
- **Width** — the root is `width: 100%` and fills its container; at 374px it matches the Figma frame.
- **Height** — `min-height: 359px`, not a fixed height, so longer text or a narrower width grows the card rather than clipping it. The button stays pinned bottom-right (`margin-top: auto`), and a 24px gap is kept below the description.
- **Positions** — padding and margins come from Figma's absolute coordinates: 24.5px top, 28px left, 33px right for the text, the button inset 41px from the right and 26.5px from the bottom, and 34px from the title's line box to the description.
- **Responsive, containers ≤374px** — horizontal padding drops to 16px (`--spacing-7`) and the title scales down with `clamp(20px, 6vw, 24px)`, so text doesn't crowd or overflow in narrow grid columns. Long words wrap (`overflow-wrap: anywhere`).
- **Accessibility** — the root is an `<article>` labelled by its `<h3>` title. The button's accessible name is "`{actionLabel}` about `{title}`" because several cards on one page would otherwise all expose an ambiguous "more". The visible label stays at the start of the name.

## Updates Table

| Date | Discriptsion |
| --- | --- |
| 2026-09-22 | Initial implementation from Figma node 484:520. |
