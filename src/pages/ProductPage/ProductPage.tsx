import { useId } from 'react';
import { NavigationBar } from '../../components/NavigationBar/NavigationBar';
import { SearchBar } from '../../components/atoms/SearchBar/SearchBar';
import { ProductCard } from '../../components/ProductCard/ProductCard';
import { Button } from '../../components/atoms/Button/Button';
import { Footer } from '../../components/Footer/Footer';
import styles from './ProductPage.module.scss';
import sofaImage from '../../assets/ProductPage/sofa.jpg';

export interface ProductPageProduct {
  id: string;
  name: string;
  price: string;
  description: string;
}

export interface ProductPageProps {
  /** Fired with the product when a Product Card's "Add to Cart" is activated. */
  onAddToCart?: (product: ProductPageProduct) => void;
  /** Fired when the featured sofa's "Add to Cart" Button is activated. */
  onAddFeaturedToCart?: () => void;
  /** Fired when the featured sofa's "View Details" Button is activated. */
  onViewDetails?: () => void;
  /** Fired with the query when the search bar is submitted. */
  onSearch?: (query: string) => void;
  /** Fired when the navigation bar's Login button is activated. */
  onLogin?: () => void;
  /** Fired with the trimmed address when the footer email form is submitted. */
  onSubscribe?: (email: string) => void;
}

const DESCRIPTION = 'Immersive spatial audio with hybrid active noise cancellation.';

/* Every card in both Figma "Product List" groups (410:1165, 410:961) uses the component
   defaults: SoundWave Pro · $149.99. Eight per list, 4 × 2. */
const makeProducts = (prefix: string): ProductPageProduct[] =>
  Array.from({ length: 8 }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    name: 'SoundWave Pro',
    price: '$149.99',
    description: DESCRIPTION,
  }));

const TECH_PRODUCTS = makeProducts('tech');
const FURNISHING_PRODUCTS = makeProducts('furnishing');

interface ProductListProps {
  products: ProductPageProduct[];
  className?: string;
  onAddToCart?: (product: ProductPageProduct) => void;
}

function ProductList({ products, className, onAddToCart }: ProductListProps) {
  return (
    <ul className={[styles.productList, className].filter(Boolean).join(' ')}>
      {products.map((product) => (
        <li className={styles.productList__item} key={product.id}>
          <ProductCard
            productName={product.name}
            price={product.price}
            description={product.description}
            onAddToCart={() => onAddToCart?.(product)}
          />
        </li>
      ))}
    </ul>
  );
}

export function ProductPage({
  onAddToCart,
  onAddFeaturedToCart,
  onViewDetails,
  onSearch,
  onLogin,
  onSubscribe,
}: ProductPageProps) {
  const baseId = useId();
  const techId = `${baseId}-tech`;
  const featureId = `${baseId}-feature`;
  const furnishingsId = `${baseId}-furnishings`;

  return (
    <div className={styles.productPage}>
      {/* NavigationBar renders the <header> landmark with its Login Button. This instance
          overrides the component fill with black @30% (Figma 410:617). */}
      <NavigationBar className={styles.productPage__nav} onLogin={onLogin} />

      <main className={styles.productPage__main}>
        <h1 className={styles.visuallyHidden}>Products</h1>

        {/* Figma "Search Bar" (410:642) — 574px, centred. */}
        <div className={styles.search}>
          <SearchBar className={styles.search__bar} onSearch={onSearch} />
        </div>

        {/* Figma "Home Tech Collection" (410:962) + "Product List" (410:1165). */}
        <section className={`${styles.collection} ${styles['collection--tech']}`} aria-labelledby={techId}>
          <div className={styles.section__inner}>
            <h2 className={styles.section__title} id={techId}>
              Home Tech Collection
            </h2>
            <ProductList products={TECH_PRODUCTS} onAddToCart={onAddToCart} />
          </div>
        </section>

        {/* Figma "Product Add" (410:977) — sofa photo bleeding off the left edge, copy + two Buttons. */}
        <section className={styles.feature} aria-labelledby={featureId}>
          <div className={styles.feature__inner}>
            <div className={styles.feature__media}>
              <img
                className={styles.feature__image}
                src={sofaImage}
                alt="Grey three-seater sofa with navy and patterned cushions on dark wooden legs"
              />
            </div>
            <div className={styles.feature__content}>
              <h2 className={styles.feature__title} id={featureId}>
                Elevate your space with comfort.
              </h2>
              <p className={styles.feature__text}>
                Crafted for modern living, our sofa combines timeless style, lasting comfort, and everyday luxury.
              </p>
              <div className={styles.feature__actions}>
                <Button variant="primary" onClick={onAddFeaturedToCart}>
                  Add to Cart
                </Button>
                <Button variant="secondary" onClick={onViewDetails}>
                  View Details
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Figma "Fine Furnishings" (410:1351) + "Product List" (410:961). */}
        <section
          className={`${styles.collection} ${styles['collection--furnishings']}`}
          aria-labelledby={furnishingsId}
        >
          <div className={styles.section__inner}>
            <h2 className={styles.section__title} id={furnishingsId}>
              Fine Furnishings
            </h2>
            <ProductList products={FURNISHING_PRODUCTS} onAddToCart={onAddToCart} />
          </div>
        </section>
      </main>

      {/* Footer renders the <footer> landmark with its own Input ("Email") and Button ("Contact Now"). */}
      <Footer className={styles.productPage__footer} onSubscribe={onSubscribe} />
    </div>
  );
}

export default ProductPage;
