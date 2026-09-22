# NavigationBar

The full-width Blue Sea Global top bar: brand logo, the Home / Products / Trend / Help & Support links, and a "Login" button (reusing `Button`). One component whose sizes switch with media queries between the Desktop (1440) and Laptop (1024) Figma frames.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `onLogin` | `() => void` | — | Called when the "Login" button is clicked. |
| `...rest` | `HTMLAttributes<HTMLElement>` | — | Passed to the root `<header>` (e.g. `className`, `id`). |

## Usage

```tsx
import { NavigationBar } from '../components/NavigationBar/NavigationBar';

<NavigationBar onLogin={() => openLoginDialog()} />
```

## Variants

Figma defines no variant properties. The two frames are screen sizes, handled by CSS only:

- **Desktop** (Navigation-Desktop 367:8, 1440×95): the base styles. 43px Instrument Serif logo, 22px Instrument Sans links.
- **Laptop** (Navigation-Laptop 402:68, 1024×95): `@media (min-width: 1024px) and (max-width: 1439px)`. 40px logo, 18px links, narrower link boxes and gaps.

Both frames: `width: 100%`, 95px tall, 25px / 46px padding, `space-between`, background `rgba(255, 255, 255, 0.1)` with `backdrop-filter: blur(3.5px)`. The Login button is the primary `Button` as-is.

## Behaviour

- Links underline on hover and show a focus-visible outline. `Button` handles its own hover and press styles.
- Clicking "Login" calls `onLogin`.

## Assumptions

- **Link spacing:** in Figma the links are text layers overlapping in one grid cell, each with its own left offset. The code uses a flex row that keeps each Figma box width and the gap to the previous box (desktop 48.47px; laptop 39.47 / 48.61 / 29.97px).
- **Link targets:** the Figma text is static, so the links point to hash anchors (`#home`, `#products`, `#trend`, `#help-support`), and the logo links to `#home`.
- **Hover style:** Figma has no hover state for the links, so they use a standard underline and a focus-visible outline.
- **Semantics:** the root is a `<header>` (`banner` landmark), and the links sit in `<nav aria-label="Primary">` as a list.
- **Above 1919px:** no design exists, so the desktop rules keep applying. No `max-width` is added.
- **Below 1024px (not in Figma):** the height becomes auto and the bar wraps. The logo and Login stay on the first row, and the links move to a full-width second row that wraps, with 4px / 24px gaps and 4px vertical tap padding. Horizontal padding is `clamp(16px, 4.5vw, 46px)`, the logo is `clamp(28px, 4vw, 40px)` and the links are `clamp(16px, 2vw, 18px)`. This works down to 375px without a hamburger menu, because Figma provides no menu icon or menu state.
- **Colours without a matching token:** the background `rgba(255, 255, 255, 0.1)` has no token. White text uses `--colors-neutral-100`.
- **Fonts:** Instrument Serif and Instrument Sans are not loaded in this repo, so they fall back to the next fonts in the stack. The logo keeps its Figma 227×45 box and has `white-space: nowrap`.

## Updates Table

| Date | Discriptsion |
| --- | --- |
| 2026-09-17 | Initial NavigationBar from Figma 402:67 (Desktop 367:8, Laptop 402:68), reusing Button. |
