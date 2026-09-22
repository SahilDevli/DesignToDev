import type { HTMLAttributes } from 'react';
import { Button } from '../atoms/Button/Button';
import styles from './NavigationBar.module.scss';

export interface NavigationBarProps extends HTMLAttributes<HTMLElement> {
  /** Called when the "Login" button is activated. */
  onLogin?: () => void;
}

const LINKS = ['Home', 'Products', 'Trend', 'Help & Support'];

const toHash = (label: string) =>
  `#${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;

export function NavigationBar({ onLogin, className, ...rest }: NavigationBarProps) {
  return (
    <header className={[styles.navigationBar, className].filter(Boolean).join(' ')} {...rest}>
      <a className={styles.navigationBar__logo} href="#home">
        Blue Sea Global
      </a>

      <nav className={styles.navigationBar__nav} aria-label="Primary">
        <ul className={styles.navigationBar__links}>
          {LINKS.map((label) => (
            <li key={label} className={styles.navigationBar__item}>
              <a className={styles.navigationBar__link} href={toHash(label)}>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Button className={styles.navigationBar__button} variant="primary" onClick={onLogin}>
        Login
      </Button>
    </header>
  );
}

export default NavigationBar;
