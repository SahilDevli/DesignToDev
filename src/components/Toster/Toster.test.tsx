/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Toster } from './Toster';

afterEach(cleanup);

describe('Toster', () => {
  it('renders the Toster variant with the default message', () => {
    render(<Toster />);
    const toast = screen.getByRole('status');
    expect(toast.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText('Login Successful!')).toBeTruthy();
  });

  it('announces a custom message passed via props', () => {
    render(<Toster message="Payment failed" />);
    expect(screen.getByRole('status').textContent).toBe('Payment failed');
    expect(screen.queryByText('Login Successful!')).toBeNull();
  });
});
