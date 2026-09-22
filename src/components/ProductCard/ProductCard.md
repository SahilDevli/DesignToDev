# ProductCard

A 300×370 product card: image, name and price, a two-line description, a 5-star rating with a review label, and an "Add to Cart" button. It has Default, Hover and Disabled states.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `state` | `'Default' \| 'Hover' \| 'Disabled'` | `'Default'` | Forces a state (Figma "State"). Hover also turns on with a real pointer hover. Disabled sets `aria-disabled` and disables the button and stars. |
| `productName` | `string` | `'SoundWave Pro'` | Product heading. Cut off with an ellipsis; the full name is in its `title`. |
| `price` | `string` | `'$149.99'` | Formatted price. |
| `description` | `string` | `'Immersive spatial audio with hybrid active noise cancellation.'` | Description, cut off after two lines. |
| `imageSrc` | `string` | — | Product image. If you leave it out, the Figma images are used, including the hover swap. |
| `ratingLabel` | `string` | `'4.8 (128 reviews)'` | Text next to the stars. |
| `value` | `number` | — | Controlled star rating (0–5). |
| `defaultValue` | `number` | `5` | Starting rating when uncontrolled. |
| `onRatingChange` | `(value: number) => void` | — | Runs when a star is clicked or picked with the arrow, Home or End keys. |
| `readOnly` | `boolean` | `false` | Shows the stars without letting users change them. |
| `onAddToCart` | `MouseEventHandler<HTMLButtonElement>` | — | Click handler for "Add to Cart". |
| `...rest` | `HTMLAttributes<HTMLElement>` | — | Passed to the root `<article>` (e.g. `className`). |

## Usage

```tsx
import { ProductCard } from '../components/ProductCard/ProductCard';

<ProductCard
  productName="SoundWave Pro"
  price="$149.99"
  description="Immersive spatial audio with hybrid active noise cancellation."
  ratingLabel="4.8 (128 reviews)"
  readOnly
  onAddToCart={() => addToCart(product)}
/>
```

## Variants

- **Default**: grey `--colors-neutral-400` border and a faint shadow. The button has a drop shadow.
- **Hover**: `--colors-primary-300` border, a `0 12px 24px rgba(79,70,229,.12)` shadow, the hover product image, and no button shadow. This state appears on real pointer hover or with `state="Hover"`.
- **Disabled**: 50% opacity, `--colors-primary-100` price and a grey (`--colors-neutral-400` / `--colors-neutral-500`) button that can't be clicked. It uses the disabled product image and read-only stars.

## Assumptions

- **Rating stars**: Figma draws the stars as one flattened graphic (`start_rate`) with all five outlined in gold, and its description says to treat them as rating stars. The one exported SVG is masked once per star (18px apart), so filled stars are gold (`--colors-secondary-700`) and empty stars are grey (`--colors-neutral-400`). `defaultValue` is 5 so the default render matches Figma. Hovering fills stars up to the one under the pointer, and clicking sets the rating. The stars form a `radiogroup` with arrow, Home and End key support. When `readOnly` is set or the card is disabled, they render as `role="img"` with the label "Rated N out of 5".
- **Rating label**: `4.8 (128 reviews)` is a separate text prop. It is not calculated from the star value.
- **Images per state**: Figma uses a different photo in each state. With no `imageSrc`, the hover photo fades in on hover and Disabled shows its own photo. When `imageSrc` is set, that one image is used in every state.
- **Cart icon colour**: one exported cart SVG is masked and painted with `currentColor`, so it is white on the primary button and `--colors-neutral-500` when disabled.
- **Pressed / focus**: Figma doesn't define these. The button turns `--colors-primary-900` while pressed. The button and the stars get a 2px focus-visible outline.
- **Description**: the text is cut off after two lines with an ellipsis, which keeps the 370px height used in Figma.
- **Responsive**: Figma defines only the 300px card, and the 1028px frame is just the variant set. The card stays 300px wide at every breakpoint, including mobile below 768px, because it already fits a 375px viewport. `max-width: 100%` lets it shrink in a narrower grid cell or container. When it shrinks, the title (flex basis 180px) gives up space first and cuts off with an ellipsis. The title row has an 8px gap so the name and price never touch. The rating row wraps its label under the stars when the card is narrower than about 220px. There are no breakpoint-specific overrides.
- **Radius**: the image and button use a 6px radius. The token scale has no 6px step, so the value is written directly.

## Updates Table

| Date | Discriptsion |
| --- | --- |
| 2026-09-17 | Created ProductCard from Figma node 5:162 (Default, Hover, Disabled). |
