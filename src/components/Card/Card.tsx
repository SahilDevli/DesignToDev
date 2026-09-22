import type { HTMLAttributes, MouseEventHandler } from 'react';
import arrowRight from '../../assets/Card/arrow-right.svg';
import arrowUpRight from '../../assets/Card/arrow-up-right.svg';
import styles from './Card.module.scss';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Layout variant. Mirrors the Figma "Type" property. */
  type?: 'Basic' | 'Image' | 'Stat';
  /** Heading text. In the Stat variant this is the small uppercase label. */
  title?: string;
  /** Body text. In the Stat variant this is the large metric value. */
  description?: string;
  /** Basic: link label. */
  linkLabel?: string;
  /** Basic: link destination. */
  href?: string;
  /** Basic: fired when the link is clicked. */
  onLinkClick?: MouseEventHandler<HTMLAnchorElement>;
  /** Image: badge text above the title. */
  badge?: string;
  /** Stat: change figure shown in the trend pill. */
  change?: string;
  /** Stat: caption next to the trend pill. */
  changeLabel?: string;
}

export function Card({
  type = 'Basic',
  title = 'Title',
  description = 'Description text',
  linkLabel = 'View documentation',
  href = '#',
  onLinkClick,
  badge = 'Productivity',
  change = '12.4%',
  changeLabel = 'since last month',
  className,
  ...rest
}: CardProps) {
  const classes = [styles.card, styles[`card--${type.toLowerCase()}`], className]
    .filter(Boolean)
    .join(' ');

  if (type === 'Image') {
    return (
      <article className={classes} {...rest}>
        <div className={styles.card__image} aria-hidden="true" />
        <div className={styles.card__content}>
          <span className={styles.card__badge}>{badge}</span>
          <div className={styles.card__text}>
            <h3 className={styles.card__title} title={title}>
              {title}
            </h3>
            <p className={styles.card__description}>{description}</p>
          </div>
        </div>
      </article>
    );
  }

  if (type === 'Stat') {
    return (
      <article className={classes} {...rest}>
        <div className={styles.card__text}>
          <h3 className={styles.card__title}>{title}</h3>
          <p className={styles.card__description}>{description}</p>
        </div>
        <div className={styles.card__footer}>
          <span className={styles.card__trend}>
            <img className={styles.card__trendIcon} src={arrowUpRight} alt="" />
            <span>{change}</span>
          </span>
          <span className={styles.card__caption}>{changeLabel}</span>
        </div>
      </article>
    );
  }

  return (
    <article className={classes} {...rest}>
      <div className={styles.card__text}>
        <h3 className={styles.card__title}>{title}</h3>
        <p className={styles.card__description}>{description}</p>
      </div>
      <a className={styles.card__link} href={href} onClick={onLinkClick}>
        {linkLabel}
        <img className={styles.card__linkIcon} src={arrowRight} alt="" />
      </a>
    </article>
  );
}
