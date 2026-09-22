# Footer

The full-width Blue Sea Global site footer: brand title and note, "Quick Links" and "Other Businesses" link columns, an email form (reusing `Input` and `Button`) and the copyright line. One component whose layout switches with media queries between the Desktop (1440) and Laptop (1024) Figma frames.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `onSubscribe` | `(email: string) => void` | — | Called with the trimmed address when the form is submitted with a valid email. The field is cleared afterwards. |
| `...rest` | `HTMLAttributes<HTMLElement>` | — | Passed to the root `<footer>` (e.g. `className`, `id`). |

## Usage

```tsx
import { Footer } from '../components/Footer/Footer';

<Footer onSubscribe={(email) => api.subscribe(email)} />
```

## Variants

Figma defines no variant properties. The two frames are screen sizes, handled by CSS only:

- **Desktop** (Footer-Desktop 376:631, 1440×459): the base styles. 64px title, 24px note, 15px links.
- **Laptop** (Footer-Laptop 404:85, 1024×459): `@media (min-width: 1024px) and (max-width: 1439px)`. 58px title moved to 31,113, 16px note, 13px links, and the columns and form moved up and closer to the right edge.

## Behaviour

- Clicking "Contact Now" (or pressing Enter in the field) submits the form. An invalid address switches `Input` to its error style and shows "Please enter a valid email id". Typing clears the error. A valid address calls `onSubscribe` and clears the field.
- `Input` handles its own focus, filled and error styles, and `Button` handles hover and press. Links underline on hover and show a focus-visible outline.

## Assumptions

- **Absolute layout ≥ 1024px:** both Figma frames are absolute layouts, so nodes use the Figma coordinates. The brand block is pinned left, the link columns and form are pinned right, and the copyright is centred (`50% - 69px`). At each design width this gives the exact Figma positions. Between breakpoints the right block follows the right edge so there is no gap. Figma's LEFT constraints would leave up to 415px of empty space on the right.
- **Above 1919px:** no design exists. The desktop rules keep applying with the same edge anchoring. No `max-width` is added.
- **Below 1024px (not in Figma):** the footer switches to a grid with auto height, and horizontal padding goes from `clamp(16px, 4vw, 42px)`. From 768–1023px, the title and note run full width, the two link columns sit side by side, and the form sits below them. Under 768px everything stacks, the input goes full width, the button wraps below it, and links get 4px vertical padding to make them easier to tap. The title scales with `clamp(40px, 5.6vw, 58px)`.
- **Line heights:** Instrument Serif uses 1.276em, the same value the pages use. Inter uses 1.21, Figma's "normal". The blank lines inside the Figma text layers become list `margin-top`: 24px × 1.276 for Quick Links, 10 + 20px × 1.276 + 10 for Other Businesses.
- **Semantics:** the column titles are `<h2>`, and each column is a `<nav>` labelled by its heading. The link text is static in Figma, so the links point to hash anchors (`#home`, `#blue-sea-hotels`, …).
- **Email validation:** Figma shows no error state for this form. The code uses a simple `name@domain.tld` check and the existing `Input` error style.
- **Button width:** `min-width: 137px` matches the Figma hug size, because Inter renders the label about 1px narrower.
- **Colours without a matching token:** background `#e0e0e0` and text `#000` are literal values. The title uses `--colors-neutral-900`.

## Updates Table

| Date | Discriptsion |
| --- | --- |
| 2026-09-17 | Initial Footer from Figma 404:84 (Desktop 376:631, Laptop 404:85), reusing Input and Button. |
