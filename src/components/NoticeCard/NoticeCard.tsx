import { useId } from 'react';
import type { HTMLAttributes, MouseEventHandler } from 'react';
import { Button } from '../atoms/Button/Button';
import styles from './NoticeCard.module.scss';

export interface NoticeCardProps extends HTMLAttributes<HTMLElement> {
  /** Notice heading. */
  title?: string;
  /** Notice body text. */
  description?: string;
  /** Visible label of the action button. */
  actionLabel?: string;
  /** Fired when the action button is clicked. */
  onAction?: MouseEventHandler<HTMLButtonElement>;
}

export function NoticeCard({
  title = 'Notice 1',
  description = 'These configuration files allow you to configure things like your database connection information, your mail server information, as well as various other core configuration values such as your application URL and encryption key.',
  actionLabel = 'more',
  onAction,
  className,
  ...rest
}: NoticeCardProps) {
  const titleId = useId();

  return (
    <article
      className={[styles.noticeCard, className].filter(Boolean).join(' ')}
      aria-labelledby={titleId}
      {...rest}
    >
      <h3 id={titleId} className={styles.noticeCard__title}>
        {title}
      </h3>
      <p className={styles.noticeCard__description}>{description}</p>
      <Button
        variant="primary"
        className={styles.noticeCard__action}
        aria-label={`${actionLabel} about ${title}`}
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </article>
  );
}
