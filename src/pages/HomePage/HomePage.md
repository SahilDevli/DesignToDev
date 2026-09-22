# HomePage

The Blue Sea Global landing page (Figma "Home Page-Desktop", node `376:556`, 1440×3760): a
full-bleed poster under the navigation bar, a band of four product cards, three customer reviews
and the footer.

Props (`HomePageProps`, all optional): `onAddToCart(product)`, `onLogin()`, `onSubscribe(email)`.

## Sections

1. **Navigation Bar** — `<header>` with the "Primary" `<nav>` and the Login button, overlaying the poster.
2. **Landing poster** — `<section>` with a full-bleed background photo and the `h1` "Everything For Your Space".
3. **Explore Products** — `<section>` with an `h2` and a full-bleed grey band holding a list of 4 Product Cards.
4. **Product's Review** — `<section>` with an `h2` and a list of 3 `<figure>`s: photo, `<blockquote>` and
   `<figcaption>` author. Rows alternate image/quote left and right.
5. **Footer** — `<footer>` with its own Input and "Contact Now" Button.

## Reused components

| Component | Import | Used for |
| --- | --- | --- |
| `NavigationBar` | `../../components/NavigationBar/NavigationBar` | Page header (contains Button "Login") |
| `ProductCard` | `../../components/ProductCard/ProductCard` | 4 cards; prices $149.99, $214.01, $149.99, $149.99 |
| `Footer` | `../../components/Footer/Footer` | Page footer (contains Input "Email" and Button "Contact Now") |

`Button` (2×) and `Input` (1×) are not imported directly: in Figma all three instances live inside
the Navigation Bar and Footer, which already render them.

## Bespoke sections

- **Landing poster** — `hero-background.jpg`, 617px tall, title 128px Instrument Serif in `--colors-neutral-200`.
- **Explore Products** — title + `#f2f2f2` band, cards 300px wide with a 57px gap.
- **Product's Review** — `#d9d9d9` quote cards (radius 25px), 32px quote text, 40px author;
  per-row column widths, gaps, image radii and text offsets are taken from the Figma frame.

Page-level overrides on reused instances: the Navigation Bar is positioned absolutely over the
poster with a `rgba(0, 0, 0, 0.39)` fill (Figma instance fill); the Footer gets a top margin. No
internals are restyled.

## Responsive behaviour

| Range | Behaviour |
| --- | --- |
| ≥ 1920px | Poster, product band, nav and footer full-bleed; content capped at 1440px and centred. |
| 1440px+ (base) | The Figma frame. |
| 1024–1439px | Titles, poster height/type, band padding, gaps and review type scale with `clamp()`. Cards 4-up (2×2 at 1024–1199). Reviews stay side by side at the Figma column ratios; photo fills the row height. |
| 768–1023px | Cards 2×2. Each review stacks: photo (3:2) above the quote card. Poster title padded clear of the taller nav. |
| < 768px | Cards 1-up. Reviews stacked. |

Checked in a browser at 320, 375, 768, 1024, 1440, 1482 and 1920px: no horizontal scroll. At
1440px every section lands on its Figma coordinates.

## Assumptions

- **Content cap + wrapper:** content is capped at 1440px (the frame width) and centred, so at 1482px there is a 21px gutter on each side while bands stay full-bleed.
- **Nav over the poster at every width:** the bar stays overlaid. Below 1024px the NavigationBar wraps to two rows (113–148px tall), so the poster title gets 176px top padding (tablet and mobile) and the poster grows to fit the title (min 420px).
- **1024–1439px:** poster height `clamp(420px, 42.85vw, 617px)`, title `clamp(2.75rem, 8.89vw, 128px)`, section titles `clamp(2.25rem, 4.44vw, 64px)`; padding-inline `clamp(1rem, 4vw, 3rem)` replaces the fixed 34px/104px insets.
- **Card grid:** 4-up down to 1200px; 2×2 between 768 and 1199px, because 4-up below 1200px would truncate card titles and 3-up leaves one card orphaned; 1-up below 768px. Below 1440px grid rows are `auto` instead of the fixed 370px.
- **Reviews:** below 1440px the per-row Figma offsets (card padding, author inset, the headphones photo's 6px drop) become one fluid padding; photos fill the row height (min `clamp(280px, 30.2vw, 435px)`). Below 1024px each review stacks with the photo first (the headphones row puts its photo on the right in Figma) at a 3:2 ratio, which matches the source photos.
- **Hero title alignment:** left-aligned in a 1148px box, as in Figma; it wraps when narrower.
- **Image alt text:** the poster photo is decorative (`alt=""`, the `h1` carries the message); review photos get descriptive alt text written from the images.
- **Colours without tokens:** `#f2f2f2` (band) and `#d9d9d9` (quote cards) have no token in `designToken.css` and are kept as SCSS variables; the nav fill `rgba(0,0,0,0.39)` is an instance override.
- **Serif line height:** 1.3em, taken from the Figma line heights (128/166, 64/83, 40/52, 32/42).
