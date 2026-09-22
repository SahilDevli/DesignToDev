/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Toster } from './Toster';

afterEach(cleanup);

describe('Toster', () => {
  it('renders the Toster variant', () => {
    render(<Toster />);
    const toast = screen.getByRole('status');
    expect(toast).toBeTruthy();
    expect(screen.getByText('Login Successful!')).toBeTruthy();
  });

  it('renders a custom message', () => {
    render(<Toster message="Changes saved" />);
    expect(screen.getByRole('status').textContent).toBe('Changes saved');
    expect(screen.queryByText('Login Successful!')).toBeNull();
  });
});
