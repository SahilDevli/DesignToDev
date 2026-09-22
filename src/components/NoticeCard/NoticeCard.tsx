import type { HTMLAttributes, MouseEventHandler } from 'react';
import { Button } from '../atoms/Button/Button';
import styles from './NoticeCard.module.scss';

export interface NoticeCardProps extends HTMLAttributes<HTMLElement> {
  /** Heading text. */
  title?: string;
  /** Body copy of the notice. */
  description?: string;
  /** Label of the action button. */
  actionLabel?: string;
  /** Fired when the action button is clicked. */
  onAction?: MouseEventHandler<HTMLButtonElement>;
}

const DEFAULT_DESCRIPTION =
  'These configuration files allow you to configure things like your database connection information, your mail server information, as well as various other core configuration values such as your application URL and encryption key.';

export function NoticeCard({
  title = 'Notice 1',
  description = DEFAULT_DESCRIPTION,
  actionLabel = 'more',
  onAction,
  className,
  ...rest
}: NoticeCardProps) {
  return (
    <article className={[styles.noticeCard, className].filter(Boolean).join(' ')} {...rest}>
      <h3 className={styles.noticeCard__title}>{title}</h3>
      <p className={styles.noticeCard__description}>{description}</p>
      <Button
        className={styles.noticeCard__action}
        onClick={onAction}
        aria-label={actionLabel === 'more' ? `More about ${title}` : undefined}
      >
        {actionLabel}
      </Button>
    </article>
  );
}
