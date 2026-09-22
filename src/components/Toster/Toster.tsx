import type { HTMLAttributes } from 'react';
import styles from './Toster.module.scss';

export interface TosterProps extends HTMLAttributes<HTMLDivElement> {
  /** Message announced inside the toast. */
  message?: string;
}

export function Toster({ message = 'Login Successful!', className, ...rest }: TosterProps) {
  return (
    <div
      className={[styles.toster, className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      {...rest}
    >
      <p className={styles.toster__message}>{message}</p>
    </div>
  );
}
