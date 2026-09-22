import { useRef, useState } from 'react';
import type { HTMLAttributes, KeyboardEvent, MouseEventHandler } from 'react';
import productImage from '../../assets/ProductCard/product-image.png';
import productImageHover from '../../assets/ProductCard/product-image-hover.png';
import productImageDisabled from '../../assets/ProductCard/product-image-disabled.png';
import styles from './ProductCard.module.scss';

const STARS = [1, 2, 3, 4, 5] as const;

export interface ProductCardProps extends Omit<HTMLAttributes<HTMLElement>, 'defaultValue'> {
  /** Forces a visual state. Mirrors the Figma "State" property; hover also happens on real pointer hover. */
  state?: 'Default' | 'Hover' | 'Disabled';
  /** Product title (truncates with an ellipsis). */
  productName?: string;
  /** Formatted price. */
  price?: string;
  /** Short description, clamped to two lines. */
  description?: string;
  /** Product image. When omitted, the Figma images are used (with the hover swap). */
  imageSrc?: string;
  /** Text next to the stars, e.g. the average score and review count. */
  ratingLabel?: string;
  /** Controlled star rating (0–5). */
  value?: number;
  /** Initial star rating when uncontrolled. */
  defaultValue?: number;
  /** Fired when a star is clicked or chosen with the keyboard. */
  onRatingChange?: (value: number) => void;
  /** Display-only stars. */
  readOnly?: boolean;
  /** Fired when "Add to Cart" is clicked. */
  onAddToCart?: MouseEventHandler<HTMLButtonElement>;
}

export function ProductCard({
  state = 'Default',
  productName = 'SoundWave Pro',
  price = '$149.99',
  description = 'Immersive spatial audio with hybrid active noise cancellation.',
  imageSrc,
  ratingLabel = '4.8 (128 reviews)',
  value,
  defaultValue = 5,
  onRatingChange,
  readOnly = false,
  onAddToCart,
  className,
  ...rest
}: ProductCardProps) {
  const isDisabled = state === 'Disabled';
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [hovered, setHovered] = useState<number | null>(null);
  const starRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const current = value ?? internalValue;
  const interactive = !readOnly && !isDisabled;
  const shown = interactive && hovered !== null ? hovered : current;

  const commit = (next: number) => {
    if (value === undefined) setInternalValue(next);
    onRatingChange?.(next);
  };

  const handleStarKeyDown = (event: KeyboardEvent<HTMLButtonElement>, star: number) => {
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(5, star + 1);
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(1, star - 1);
    if (event.key === 'Home') next = 1;
    if (event.key === 'End') next = 5;
    if (next === null) return;
    event.preventDefault();
    commit(next);
    starRefs.current[next - 1]?.focus();
  };

  const classes = [
    styles.productCard,
    state !== 'Default' && styles[`productCard--${state.toLowerCase()}`],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const starClass = (star: number) =>
    [styles.productCard__star, star <= shown && styles['productCard__star--filled']].filter(Boolean).join(' ');

  return (
    <article className={classes} aria-disabled={isDisabled || undefined} {...rest}>
      <div className={styles.productCard__image}>
        <img
          className={styles.productCard__img}
          src={imageSrc ?? (isDisabled ? productImageDisabled : productImage)}
          alt={productName}
        />
        {!imageSrc && !isDisabled && (
          <img
            className={`${styles.productCard__img} ${styles.productCard__imgHover}`}
            src={productImageHover}
            alt=""
            aria-hidden="true"
          />
        )}
      </div>

      <div className={styles.productCard__info}>
        <div className={styles.productCard__titleRow}>
          <h3 className={styles.productCard__title} title={productName}>
            {productName}
          </h3>
          <p className={styles.productCard__price}>{price}</p>
        </div>
        <p className={styles.productCard__description}>{description}</p>
        <div className={styles.productCard__ratingRow}>
          {interactive ? (
            <div
              className={styles.productCard__stars}
              role="radiogroup"
              aria-label="Rate this product"
              onMouseLeave={() => setHovered(null)}
            >
              {STARS.map((star) => (
                <button
                  key={star}
                  ref={(node) => {
                    starRefs.current[star - 1] = node;
                  }}
                  type="button"
                  role="radio"
                  className={starClass(star)}
                  aria-checked={star === current}
                  aria-label={`${star} star${star > 1 ? 's' : ''}`}
                  tabIndex={star === (current || 1) ? 0 : -1}
                  onMouseEnter={() => setHovered(star)}
                  onClick={() => commit(star)}
                  onKeyDown={(event) => handleStarKeyDown(event, star)}
                />
              ))}
            </div>
          ) : (
            <span className={styles.productCard__stars} role="img" aria-label={`Rated ${current} out of 5`}>
              {STARS.map((star) => (
                <span key={star} className={starClass(star)} aria-hidden="true" />
              ))}
            </span>
          )}
          <span className={styles.productCard__ratingLabel}>{ratingLabel}</span>
        </div>
      </div>

      <button type="button" className={styles.productCard__button} disabled={isDisabled} onClick={onAddToCart}>
        <span className={styles.productCard__cartIcon} aria-hidden="true" />
        Add to Cart
      </button>
    </article>
  );
}
