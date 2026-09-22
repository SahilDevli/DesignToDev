import {
  useId,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
  type InputHTMLAttributes,
} from 'react';
import styles from './SearchBar.module.scss';

export type SearchBarState = 'default' | 'focus';

export interface SearchBarProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type' | 'onChange' | 'value' | 'defaultValue'> {
  /** Forces a visual state for stories, tests and docs. Leave unset so focus responds to real interaction. */
  state?: SearchBarState;
  /** Controlled value. */
  value?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Called with the current value when the search is submitted (button click or Enter). */
  onSearch?: (value: string) => void;
  /** Class applied to the root form element. */
  className?: string;
}

export function SearchBar({
  state,
  placeholder = 'search here',
  value,
  defaultValue,
  onSearch,
  onChange,
  onFocus,
  onBlur,
  className,
  id,
  ...rest
}: SearchBarProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  const [isFocused, setIsFocused] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue ?? '');
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  const resolvedState: SearchBarState = state ?? (isFocused ? 'focus' : 'default');

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    setIsFocused(true);
    onFocus?.(event);
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setIsFocused(false);
    onBlur?.(event);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (!isControlled) setInternalValue(event.target.value);
    onChange?.(event);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch?.(currentValue ?? '');
  }

  const classes = [styles.searchbar, styles[`searchbar--${resolvedState}`], className]
    .filter(Boolean)
    .join(' ');

  return (
    <form className={classes} role="search" onSubmit={handleSubmit}>
      <label className={styles.searchbar__label} htmlFor={inputId}>
        Search
      </label>
      <input
        id={inputId}
        type="search"
        className={styles.searchbar__field}
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        {...rest}
      />
      <button type="submit" className={styles.searchbar__button} aria-label="Search">
        <span className={styles.searchbar__icon} aria-hidden="true" />
      </button>
    </form>
  );
}
