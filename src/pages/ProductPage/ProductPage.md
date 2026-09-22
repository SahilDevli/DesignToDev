# ProductPage

The product listing page for Blue Sea Global. It opens with a search bar and a "Home Tech Collection" grid, then a featured sofa promotion, then a "Fine Furnishings" grid. It is built from Figma "Product Page" (409:446, 1440×3530), the only frame in the design.

## Sections

1. **Navigation Bar** (`<header>` / `<nav aria-label="Primary">`): reused `NavigationBar` with its Login `Button`.
2. **Search Bar** (Figma 410:642): reused `SearchBar` (`role="search"`), 574px wide and centred.
3. **Home Tech Collection** (410:962 + Product List 410:1165): bespoke `<section>` with an `h2` and a 4 × 2 list of reused `ProductCard`s.
4. **Product Add** (410:977): bespoke `<section>`. It has the sofa photo (`src/assets/ProductPage/sofa.jpg`, exported from Figma), an `h2` of "Elevate your space with comfort.", body copy, and two reused `Button`s: "Add to Cart" (primary) and "View Details" (secondary).
5. **Fine Furnishings** (410:1351 + Product List 410:961): bespoke `<section>` with an `h2` and a 4 × 2 list of reused `ProductCard`s.
6. **Footer** (`<footer>`): reused `Footer` with its `Input` ("Email") and "Contact Now" `Button`.

## Reused vs bespoke

| Reused (imported, not restyled) | Bespoke (authored here) |
| --- | --- |
| `NavigationBar`, `SearchBar`, `ProductCard` ×16, `Button` ×2 on the page (+ Login and Contact Now inside nav/footer), `Footer`, `Input` (inside `Footer`) | Section headings, the two product-list grids, the Product Add layout, page spacing |

Page-level overrides on reused instances:
- The Navigation Bar gets the Figma instance fill, `rgba(0, 0, 0, 0.3)`.
- The Search Bar gets a 574px max-width wrapper.
- The Footer gets a top margin.

No component internals are restyled.

## Props

`ProductPageProps`. Every prop is an optional callback:
- `onAddToCart(product)`
- `onAddFeaturedToCart()`
- `onViewDetails()`
- `onSearch(query)`
- `onLogin()`
- `onSubscribe(email)`

## Responsive behaviour

| Range | Behaviour |
| --- | --- |
| ≥ 1920px | Nav and footer full-bleed; content (including the sofa band) capped at 1440px and centred. |
| 1440px+ (base) | The Figma frame: cards 300×370 with 33px/50px gaps, sofa photo 700×424 flush left, copy column 628px. |
| 1024–1439px | Section titles, gaps, margins and feature type scale with `clamp()`. Cards stay 4-up down to 1200px and go 3-up from 1024 to 1199px. The feature stays side by side at the 700:628 ratio, with the photo at 700:424 and the copy vertically centred. |
| 768–1023px | Cards 2-up. Feature stacks: full-width photo above the copy and Buttons. The NavigationBar wraps to two rows (its own behaviour). |
| < 768px | Cards 1-up. Feature stacked. |

Checked in a browser at 320, 375, 768, 1024, 1100, 1440 and 1920px. There is no horizontal scroll at any of them. At 1440px every section lands on its Figma coordinates, and the page is 3530px tall.

## Assumptions

- **Page `h1`:** Figma has no h1, so there is a visually hidden `<h1>Products</h1>`. The section titles and the feature headline are `h2`, and the ProductCard titles are `h3`.
- **Feature headline as `h2`:** "Elevate your space with comfort." is marked up as the section heading. Figma's empty 48px line between the headline and the body becomes a top margin on the body text (1.276 × 48px).
- **Active nav link:** in Figma, "Products" is coloured `--colors-primary-700`. `NavigationBar` has no active-link prop, and its internals must not be restyled, so every link keeps its default colour.
- **Nav stays in flow:** in Figma the bar is absolutely positioned at y 0, but nothing sits under it, so it stays in normal flow. The search bar follows 13px below it.
- **Burger menu:** there isn't one. The reused `NavigationBar` wraps its links onto a second row below 1024px, and that component was not changed.
- **Sub-pixel x offsets:** at 1440px the page reproduces Figma's x positions: 66px for the first title, 70/71px for the lists and the second title. Below 1440px they collapse to one fluid `padding-inline: clamp(1rem, 4vw, 3rem)`.
- **Card grid:** 4-up down to 1200px. From 1024 to 1199px it is 3-up, because 4-up would truncate card titles. It is 2-up from 768 to 1023px and 1-up below 768px. Below 1440px grid rows are `auto` instead of the fixed 370px. At 1440px they are fixed because the rendered card is about 1.4px taller than Figma.
- **Feature below 1440px:** the fixed 424px photo height becomes a 700:424 aspect ratio. The copy is vertically centred beside the photo on laptop, and stacks under the photo below 1024px. The Buttons wrap if needed.
- **Fluid values below 1440px:**
  - Section titles: `clamp(2.25rem, 4.44vw, 64px)`
  - Feature headline: `clamp(1.75rem, 3.33vw, 48px)`
  - Feature body: `clamp(1.25rem, 2.5vw, 36px)`
  - Footer top margin: `clamp(64px, 20.69vw, 298px)`
- **Product data:** all 16 cards use the Figma values: SoundWave Pro, $149.99, and the component's default description, image and rating.
- **Sofa alt text:** written from the image, because Figma has no description for it.
- **Serif line height:** 1.276em, taken from the Figma text boxes (81.68 / 64).
