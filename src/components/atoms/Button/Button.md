# Button

A clickable action button with `primary` and `secondary` visual styles. Use `primary` for the
main action in a group (e.g. "Add to Cart") and `secondary` for a lower-emphasis action next to
it (e.g. "View Details").

## Props

| Prop        | Type                                  | Default     | Description                                                                                   |
| ----------- | -------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `variant`   | `'primary' \| 'secondary'`            | `'primary'` | Visual style. Mirrors the Figma "Type" property.                                                |
| `state`     | `'default' \| 'hover' \| 'disabled'`  | `undefined` | Forces a visual state for stories, tests and docs. Leave unset for real hover/press/disabled.   |
| `disabled`  | `boolean`                              | `false`     | Native disabled flag; equivalent to `state="disabled"`. Blocks all pointer/keyboard handlers.   |
| `type`      | `'button' \| 'submit' \| 'reset'`     | `'button'`  | Native `<button>` type.                                                                          |
| `children`  | `ReactNode`                            | —           | Button label/content.                                                                            |
| ...rest     | `ButtonHTMLAttributes<HTMLButtonElement>` | —       | Any other native button attribute (`onClick`, `aria-label`, etc.) passes through.                |

## Usage

```tsx
import { Button } from '../../components/atoms/Button/Button';

<Button variant="primary" onClick={handleAddToCart}>
  Add to Cart
</Button>
<Button variant="secondary" onClick={handleViewDetails}>
  View Details
</Button>
```

## Variants

- `primary` / `default` — solid indigo fill, white text.
- `primary` / `hover` — darker indigo fill (real on mouse hover; forceable via `state="hover"`).
- `primary` / `disabled` — indigo fill at 40% opacity, `aria-disabled="true"`, handlers blocked.
- `secondary` / `default` — light fill, primary-700 border and text.
- `secondary` / `hover` — primary-700 fill, white text and border.
- `secondary` / `disabled` — muted grey fill at 40% opacity, `aria-disabled="true"`, handlers blocked.

## Assumptions

- Figma's border on the Secondary variant (1.5px, stroke-align inside) is replicated by drawing a
  real CSS border and subtracting 1.5px from the padding, so the Secondary button still hugs to
  the same 94×41 box as Primary instead of growing by the border width.
- Primary's fill (`#4f46e5`/`#3d397c`) and Secondary Disabled's colors (`#757272`/`#1f189a`/`#4f46e5`)
  are not bound to any Figma variable (`get_variable_defs` only returned `Colors/Primary/700` and
  `Colors/Neutral/100`), so they're written as raw hex rather than forced onto a mismatched token.
- No separate mobile/tablet design exists. Below 768px the button gets `min-height: 44px` to meet
  the WCAG 2.5.5 touch-target guideline; the design's own 41px height is kept from tablet up. No
  other breakpoint changes are needed since the button hugs its content and never overflows.
- "Pressed" (pointer-down) feedback isn't a distinct Figma state, so a subtle `scale(0.98)` on
  `:active` was added as the conventional accessible affordance.
- `variant`/`state` values are lowercase (`primary`/`secondary`, `default`/`hover`/`disabled`)
  rather than matching Figma's `Type`/`State` capitalization, to match the API already consumed by
  `src/pages/ProductPage/ProductPage.tsx` (`<Button variant="primary">` / `variant="secondary"`).

## Updates

| Date       | Description                          |
| ---------- | ------------------------------------- |
| 2026-09-16 | Initial implementation from Figma.    |
