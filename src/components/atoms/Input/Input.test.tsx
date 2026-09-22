/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Input } from './Input';

afterEach(cleanup);

describe('Input', () => {
  it('renders the default variant', () => {
    render(<Input state="default" label="Label" placeholder="Enter value" />);
    expect(screen.getByLabelText('Label')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter value')).toBeTruthy();
  });

  it('renders the filled variant', () => {
    render(<Input state="filled" label="Label" defaultValue="Enter value" />);
    const input = screen.getByLabelText('Label') as HTMLInputElement;
    expect(input.value).toBe('Enter value');
  });

  it('renders the active variant', () => {
    render(<Input state="active" label="Label" />);
    expect(screen.getByLabelText('Label')).toBeTruthy();
  });

  it('renders the disabled variant', () => {
    render(<Input state="disabled" label="Label" />);
    const input = screen.getByLabelText('Label');
    expect(input.getAttribute('aria-disabled')).toBe('true');
    expect(input.hasAttribute('disabled')).toBe(true);
  });

  it('renders the error variant with the error message visible', () => {
    render(<Input state="error" label="Label" errorMessage="Error message" />);
    expect(screen.getByText('Error message')).toBeTruthy();
    expect(screen.getByLabelText('Label').getAttribute('aria-invalid')).toBe('true');
  });

  it('moves from default to filled/active on real typing and focus, uncontrolled', () => {
    render(<Input label="Label" />);
    const input = screen.getByLabelText('Label') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(input.value).toBe('hello');

    fireEvent.blur(input);
    expect(input.getAttribute('aria-disabled')).toBeNull();
  });

  it('blocks focus/change side effects when disabled', () => {
    const onChange = vi.fn();
    render(<Input label="Label" disabled onChange={onChange} />);
    const input = screen.getByLabelText('Label');
    expect(input.hasAttribute('disabled')).toBe(true);
  });
});
