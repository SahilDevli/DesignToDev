import { useId, useState, type ChangeEvent, type FocusEvent, type InputHTMLAttributes } from 'react';
import styles from './Input.module.scss';

export type InputState = 'default' | 'filled' | 'active' | 'disabled' | 'error';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Text shown above the field. */
  label?: string;
  /** Message shown below the field when invalid; also triggers the error style if `state` is unset. */
  errorMessage?: string;
  /** Forces a visual state for stories, tests and docs. Leave unset so focus/typing/disabled respond to real interaction. */
  state?: InputState;
  /** Class applied to the outer wrapper (label + box + message). */
  className?: string;
}

export function Input({
  label = 'Label',
  errorMessage,
  state,
  disabled = false,
  className,
  id,
  value,
  defaultValue,
  placeholder = 'Enter value',
  onFocus,
  onBlur,
  onChange,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  const [isFocused, setIsFocused] = useState(false);
  const [hasValue, setHasValue] = useState(Boolean(value ?? defaultValue));
  const isControlled = value !== undefined;

  const isDisabled = disabled || state === 'disabled';
  const hasError = state === 'error' || (!state && Boolean(errorMessage));
  const isFilled = isControlled ? Boolean(value) : hasValue;

  const resolvedState: InputState =
    state ?? (isDisabled ? 'disabled' : hasError ? 'error' : isFocused ? 'active' : isFilled ? 'filled' : 'default');

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    setIsFocused(true);
    onFocus?.(event);
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setIsFocused(false);
    onBlur?.(event);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (!isControlled) setHasValue(event.target.value.length > 0);
    onChange?.(event);
  }

  const wrapperClasses = [styles.input, styles[`input--${resolvedState}`], className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapperClasses}>
      <label className={styles.input__label} htmlFor={inputId}>
        {label}
      </label>
      <div className={styles.input__box}>
        <input
          id={inputId}
          className={styles.input__field}
          value={value}
          defaultValue={defaultValue}
          placeholder={placeholder}
          disabled={isDisabled}
          aria-disabled={isDisabled || undefined}
          aria-invalid={resolvedState === 'error' || undefined}
          aria-describedby={resolvedState === 'error' ? errorId : undefined}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={handleChange}
          {...rest}
        />
      </div>
      {resolvedState === 'error' && (
        <p className={styles.input__error} id={errorId}>
          {errorMessage || 'Error message'}
        </p>
      )}
    </div>
  );
}
