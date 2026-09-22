# Input

A single-line labeled text field with built-in filled, focus, disabled and error styling. Use
it for any form field where the surrounding page owns validation and controls the value.

## Props

| Prop           | Type                                                              | Default        | Description                                                                                     |
| -------------- | ------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------- |
| `label`        | `string`                                                            | `'Label'`      | Text shown above the field.                                                                        |
| `errorMessage` | `string`                                                            | `undefined`    | Message shown below the field; providing it also switches to the error style (unless `state` is set). |
| `state`        | `'default' \| 'filled' \| 'active' \| 'disabled' \| 'error'`       | `undefined`    | Forces a visual state for stories, tests and docs. Leave unset for real focus/typing/disabled behavior. |
| `disabled`     | `boolean`                                                           | `false`        | Native disabled flag; equivalent to `state="disabled"`. Blocks all pointer/keyboard/change handlers. |
| `placeholder`  | `string`                                                            | `'Enter value'`| Native input placeholder.                                                                           |
| `value`        | `string`                                                            | `undefined`    | Controlled value.                                                                                    |
| `defaultValue` | `string`                                                            | `undefined`    | Uncontrolled initial value.                                                                          |
| ...rest        | `InputHTMLAttributes<HTMLInputElement>`                             | —              | Any other native input attribute (`onChange`, `name`, `type`, `aria-label`, etc.) passes through.  |

## Usage

```tsx
import { Input } from '../../components/atoms/Input/Input';

<Input label="Email" placeholder="you@example.com" onChange={handleChange} />
<Input label="Email" errorMessage="Enter a valid email" value={email} onChange={handleChange} />
```

## Variants

- `default` — empty field, neutral border, placeholder in `neutral-500`.
- `filled` — has a value; text renders in `neutral-900`. Real usage: reached by typing (tracked
  via internal state for uncontrolled fields, or derived from `value` when controlled).
- `active` — focused; 2px `primary-400` border and label. Real usage: reached via native focus/blur.
- `disabled` — native `disabled` attribute; muted colors at 60% opacity, `aria-disabled="true"`,
  handlers blocked.
- `error` — set via `errorMessage`; `accent-900` border/label and a message row below the field,
  `aria-invalid="true"` and `aria-describedby` pointing at the message.

## Assumptions

- **Root width:** Figma's frame is a fixed 280px, but the root wrapper uses `width: 100%` so the
  field fills whatever container it's placed in (a form column, a footer cell, etc.) instead of
  being pinned to 280px — the more useful default for an atom with no fixed usage context, and it
  still measures exactly 280px in a 280px container.
- **State precedence when unforced:** `disabled` > `error` > `active` (focused) > `filled` (has a
  value) > `default`. E.g. focusing a field that already has an `errorMessage` keeps the error
  style rather than switching to active, since the error should stay visible until the caller
  clears it.
- **Filled/Active/Error text color** comes from real `::placeholder` vs. value color rather than a
  per-state override, since Figma's own "value" text in Default/Active reads as placeholder-style
  copy while Filled/Error reads as real typed content.
- The 1.5px error border and the 2px active border (both `strokeAlign: INSIDE` in Figma) each
  subtract their own width from the 14px/10px padding so the box stays 42px tall in every state —
  see `.input--active` / `.input--error` in `Input.module.scss`.
- Below 768px the input box gets `min-height: 44px` for the WCAG 2.5.5 touch-target guideline; no
  other breakpoint override is needed since the field is already fluid.

## Updates

| Date       | Description                       |
| ---------- | ----------------------------------- |
| 2026-09-17 | Initial implementation from Figma.  |
