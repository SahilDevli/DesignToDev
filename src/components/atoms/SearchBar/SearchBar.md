# SearchBar

A pill-shaped search field with a circular submit button. Use it as the primary search entry
point on a page header or listings toolbar.

## Props

| Prop          | Type                                                      | Default          | Description                                                                                 |
| ------------- | ----------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| `state`       | `'default' \| 'focus'`                                       | `undefined`       | Forces a visual state for stories, tests and docs. Leave unset for real focus behavior.          |
| `placeholder` | `string`                                                     | `'search here'`   | Native input placeholder.                                                                        |
| `value`       | `string`                                                     | `undefined`       | Controlled value.                                                                                |
| `defaultValue`| `string`                                                     | `undefined`       | Uncontrolled initial value.                                                                      |
| `onChange`    | `(event: ChangeEvent<HTMLInputElement>) => void`             | `undefined`       | Fires on every keystroke.                                                                        |
| `onSearch`    | `(value: string) => void`                                    | `undefined`       | Fires with the current value when the form is submitted (search button click or Enter key).      |
| `className`   | `string`                                                     | `undefined`       | Class applied to the root `<form>`.                                                              |
| ...rest       | `InputHTMLAttributes<HTMLInputElement>`                      | —                 | Any other native input attribute (`name`, `aria-label`, etc.) passes through to the `<input>`.    |

## Usage

```tsx
import { SearchBar } from '../../components/atoms/SearchBar/SearchBar';

<SearchBar placeholder="search here" onSearch={(value) => runSearch(value)} />
<SearchBar value={query} onChange={(e) => setQuery(e.target.value)} onSearch={runSearch} />
```

## Variants

- `default` — neutral-400 pill, transparent 3px border reserved (no visible border).
- `focus` — the same pill with a 3px `primary-700` border and the search icon recolored to
  `primary-700`. Real usage: reached by focusing the input; releasing focus returns to `default`.

## Assumptions

- **Root width:** Figma's frame is a fixed 574px, but the root `<form>` uses `width: 100%` so the
  bar fills whatever container it's placed in, while still measuring exactly 574px in a 574px
  container.
- **Accessible name:** Figma shows "search here" as static copy inside the field with no separate
  label. It's implemented as the `<input>`'s placeholder plus a visually-hidden `<label>` ("Search")
  so screen reader users get an accessible name; the placeholder text stays visible as in the design.
- **Submit behavior:** Figma has no prototype interaction wired on the search button, so submitting
  (button click or pressing Enter in the field) calls the `onSearch(value)` callback and
  `preventDefault()`s the native form navigation — the conventional accessible pattern for a search
  field's button.
- **White circle button:** the Figma "search button" layer is a flat white circle with no additional
  detail, so it's built with `border-radius: 50%` and the `neutral-100` token rather than committing
  a redundant SVG asset for a plain circle.
- **Search icon recolor:** the Default (`#2A2A2A`) and Focus (`#3262AB`) icon layers in Figma are the
  identical glyph in two flat colors, so a single exported SVG is reused as a CSS `mask` and
  recolored per state with `background-color` (`neutral-900` / `primary-700`) instead of committing
  two near-duplicate asset files.
- **Font:** Figma specifies Instrument Sans, which isn't loaded anywhere in this project (same as the
  existing `Input`/`Button` atoms), so the field falls back to the project's system font stack
  (`Inter`, system sans-serif) for visual consistency with the rest of the atoms.
- **Responsive:** below 768px the height shrinks 70px → 56px, the button 65px → 48px (still above the
  44px WCAG 2.5.5 touch-target minimum), the icon 22px → 18px, font 22px → 16px, and left padding
  31px → the `--spacing-8` (20px) token. From tablet width up the design's exact 574px-frame values
  apply unchanged, matching the single breakpoint Figma provides.

## Updates

| Date       | Description                       |
| ---------- | ----------------------------------- |
| 2026-09-17 | Initial implementation from Figma.  |
