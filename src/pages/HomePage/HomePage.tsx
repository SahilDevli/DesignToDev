import { useId } from 'react';
import { NavigationBar } from '../../components/NavigationBar/NavigationBar';
import { ProductCard } from '../../components/ProductCard/ProductCard';
import { Footer } from '../../components/Footer/Footer';
import styles from './HomePage.module.scss';
import heroBackground from '../../assets/HomePage/hero-background.jpg';
import reviewSpeaker from '../../assets/HomePage/review-speaker.png';
import reviewHeadphones from '../../assets/HomePage/review-headphones.png';
import reviewBed from '../../assets/HomePage/review-bed.jpg';

export interface HomePageProps {
  /** Fired with the product when a Product Card's "Add to Cart" is activated. */
  onAddToCart?: (product: HomePageProduct) => void;
  /** Fired when the navigation bar's Login button is activated. */
  onLogin?: () => void;
  /** Fired with the trimmed address when the footer email form is submitted. */
  onSubscribe?: (email: string) => void;
}

export interface HomePageProduct {
  name: string;
  price: string;
  description: string;
}

interface Review {
  key: 'speaker' | 'headphones' | 'bed';
  image: string;
  alt: string;
  paragraphs: string[];
  author: string;
}

const DESCRIPTION = 'Immersive spatial audio with hybrid active noise cancellation.';

/* Figma "Product Cards" (373:231), left to right: 373:232, 373:233, 373:234, 373:302.
   Only the price of 373:233 is overridden; the image is the component default. */
const PRODUCTS: HomePageProduct[] = [
  { name: 'SoundWave Pro', price: '$149.99', description: DESCRIPTION },
  { name: 'SoundWave Pro', price: '$214.01', description: DESCRIPTION },
  { name: 'SoundWave Pro', price: '$149.99', description: DESCRIPTION },
  { name: 'SoundWave Pro', price: '$149.99', description: DESCRIPTION },
];

/* Figma "Product Reviews" (373:432), top to bottom: Product 3, Product 2, Product 1. */
const REVIEWS: Review[] = [
  {
    key: 'speaker',
    image: reviewSpeaker,
    alt: 'Black vintage-style guitar-amp speaker with brass control knobs',
    paragraphs: [
      'Amazing speaker with great sound and strong build quality. Perfect for blasting music while running through the subway!',
      'No time to stop—gotta keep running!',
    ],
    author: 'by Jake from Subway Surfers',
  },
  {
    key: 'headphones',
    image: reviewHeadphones,
    alt: 'Black over-ear wireless headphones',
    paragraphs: [
      'Awesome headphones with great sound quality and a solid build. Comfortable, reliable, and perfect for gaming. Raze is loving them too',
      'Now, time to dominate the battlefield!',
    ],
    author: 'by Raze',
  },
  {
    key: 'bed',
    image: reviewBed,
    alt: 'Upholstered grey bed with white linen in a softly lit bedroom',
    paragraphs: [
      'Very comfortable and sturdy bed. Good quality, smooth finish, and perfect for a peaceful night’s sleep. Simple, reliable, and worth the money.',
    ],
    author: 'by Roronoa Zoro',
  },
];

export function HomePage({ onAddToCart, onLogin, onSubscribe }: HomePageProps) {
  const baseId = useId();
  const heroId = `${baseId}-hero`;
  const productsId = `${baseId}-products`;
  const reviewsId = `${baseId}-reviews`;

  return (
    <div className={styles.homePage}>
      {/* NavigationBar renders the <header> landmark (with the Login Button). This instance
          overlays the poster and overrides the component fill with black @39% (Figma 373:197). */}
      <NavigationBar className={styles.homePage__nav} onLogin={onLogin} />

      <main className={styles.homePage__main}>
        {/* Figma "Landing-Poster" (373:337) — full-bleed 617px photo with the display title. */}
        <section className={styles.hero} aria-labelledby={heroId}>
          <img className={styles.hero__image} src={heroBackground} alt="" />
          <div className={styles.hero__inner}>
            <h1 className={styles.hero__title} id={heroId}>
              Everything For Your Space
            </h1>
          </div>
        </section>

        {/* Figma "Product's Queue" (373:333) — title, then a full-bleed band with four cards. */}
        <section className={styles.products} aria-labelledby={productsId}>
          <div className={styles.section__inner}>
            <h2 className={styles.section__title} id={productsId}>
              Explore Products
            </h2>
          </div>
          <div className={styles.products__band}>
            <ul className={`${styles.section__inner} ${styles.products__grid}`}>
              {PRODUCTS.map((product, index) => (
                <li className={styles.products__item} key={index}>
                  <ProductCard
                    productName={product.name}
                    price={product.price}
                    description={product.description}
                    onAddToCart={() => onAddToCart?.(product)}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Figma "Product Reviews" (373:432) — three image + quote rows. */}
        <section className={styles.reviews} aria-labelledby={reviewsId}>
          <div className={styles.section__inner}>
            <h2 className={styles.section__title} id={reviewsId}>
              Product’s Review
            </h2>
            <ul className={styles.reviews__list}>
              {REVIEWS.map((review) => (
                <li className={styles.reviews__item} key={review.key}>
                  <figure className={`${styles.review} ${styles[`review--${review.key}`]}`}>
                    <div className={styles.review__media}>
                      <img className={styles.review__image} src={review.image} alt={review.alt} />
                    </div>
                    <div className={styles.review__card}>
                      <blockquote className={styles.review__quote}>
                        {review.paragraphs.map((text) => (
                          <p className={styles.review__text} key={text}>
                            {text}
                          </p>
                        ))}
                      </blockquote>
                      <figcaption className={styles.review__author}>{review.author}</figcaption>
                    </div>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      {/* Footer renders the <footer> landmark with its own Input ("Email") and Button
          ("Contact Now"). Its defaults already match every string in Figma 376:632. */}
      <Footer className={styles.homePage__footer} onSubscribe={onSubscribe} />
    </div>
  );
}

export default HomePage;
