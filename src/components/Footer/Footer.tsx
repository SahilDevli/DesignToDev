import { useState, type FormEvent, type HTMLAttributes } from 'react';
import { Button } from '../atoms/Button/Button';
import { Input } from '../atoms/Input/Input';
import styles from './Footer.module.scss';

export interface FooterProps extends Omit<HTMLAttributes<HTMLElement>, 'onSubmit'> {
  /** Fired with the trimmed address when the email form is submitted with a valid email. */
  onSubscribe?: (email: string) => void;
}

const QUICK_LINKS = ['Home', 'Products', 'Trend', 'Customer’s Reviews', 'About Us', 'Help & Support'];
const OTHER_BUSINESSES = ['Blue Sea Automobiles', 'Blue Sea Hotels', 'Blue Sea Docker'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const toHash = (label: string) =>
  `#${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;

export function Footer({ onSubscribe, className, ...rest }: FooterProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim();
    if (!EMAIL_PATTERN.test(value)) {
      setError('Please enter a valid email id');
      return;
    }
    setError(undefined);
    onSubscribe?.(value);
    setEmail('');
  }

  return (
    <footer className={[styles.footer, className].filter(Boolean).join(' ')} {...rest}>
      <p className={styles.footer__title}>Blue Sea Global</p>

      <p className={styles.footer__note}>
        Since 1940, Blue Sea Global has grown with trust, vision, and ambition.
        <br />
        Blue Sea Automobiles • Blue Sea Hotels • Blue Sea Docker
        <br />
        <br />
        A legacy built to last.
      </p>

      <nav className={`${styles.footer__column} ${styles['footer__column--quick']}`} aria-labelledby="footer-quick-links">
        <h2 id="footer-quick-links" className={styles.footer__heading}>
          Quick Links
        </h2>
        <ul className={`${styles.footer__list} ${styles['footer__list--quick']}`}>
          {QUICK_LINKS.map((label) => (
            <li key={label}>
              <a className={styles.footer__link} href={toHash(label)}>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <nav className={`${styles.footer__column} ${styles['footer__column--other']}`} aria-labelledby="footer-other-businesses">
        <h2 id="footer-other-businesses" className={styles.footer__heading}>
          Other Businesses
        </h2>
        <ul className={`${styles.footer__list} ${styles['footer__list--other']}`}>
          {OTHER_BUSINESSES.map((label) => (
            <li key={label}>
              <a className={styles.footer__link} href={toHash(label)}>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <form className={styles.footer__form} onSubmit={handleSubmit} noValidate>
        <Input
          className={styles.footer__input}
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Please enter email id"
          value={email}
          errorMessage={error}
          onChange={(event) => {
            setEmail(event.target.value);
            if (error) setError(undefined);
          }}
        />
        <Button className={styles.footer__button} type="submit" variant="primary">
          Contact Now
        </Button>
      </form>

      <p className={styles.footer__copyright}>© 2026 all right reserved</p>
    </footer>
  );
}

export default Footer;
