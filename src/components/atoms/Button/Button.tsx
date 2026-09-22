import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.scss';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. Mirrors the Figma "Type" property. */
  variant?: 'primary' | 'secondary';
  /** Forces a visual state for stories, tests and docs. Leave unset so hover/press/disabled respond to real interaction. */
  state?: 'default' | 'hover' | 'disabled';
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  state,
  disabled = false,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = state === 'disabled' || disabled;

  const classes = [
    styles.button,
    styles[`button--${variant}`],
    state === 'hover' ? styles['button--hover'] : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
