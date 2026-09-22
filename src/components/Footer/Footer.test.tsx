/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Footer } from './Footer';

afterEach(cleanup);

function expectFooterContent() {
  const footer = screen.getByRole('contentinfo');
  expect(within(footer).getByText('Blue Sea Global')).toBeTruthy();
  expect(within(footer).getByRole('heading', { name: 'Quick Links' })).toBeTruthy();
  expect(within(footer).getByRole('heading', { name: 'Other Businesses' })).toBeTruthy();
  expect(within(footer).getByRole('link', { name: 'Help & Support' })).toBeTruthy();
  expect(within(footer).getByRole('link', { name: 'Blue Sea Docker' })).toBeTruthy();
  expect(within(footer).getByLabelText('Email')).toBeTruthy();
  expect(within(footer).getByRole('button', { name: 'Contact Now' })).toBeTruthy();
  expect(within(footer).getByText('© 2026 all right reserved')).toBeTruthy();
}

describe('Footer', () => {
  // Desktop and Laptop are the same markup; the breakpoint is CSS-only.
  it('renders the Desktop variant', () => {
    render(<Footer />);
    expectFooterContent();
  });

  it('renders the Laptop variant', () => {
    render(<Footer />);
    expectFooterContent();
  });

  it('submits a valid email and flags an invalid one', () => {
    const onSubscribe = vi.fn();
    render(<Footer onSubscribe={onSubscribe} />);
    const input = screen.getByLabelText('Email') as HTMLInputElement;
    const button = screen.getByRole('button', { name: 'Contact Now' });

    fireEvent.change(input, { target: { value: 'not-an-email' } });
    fireEvent.click(button);
    expect(onSubscribe).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Please enter a valid email id')).toBeTruthy();

    fireEvent.change(input, { target: { value: '  sea@bluesea.com ' } });
    expect(input.getAttribute('aria-invalid')).toBeNull();
    fireEvent.click(button);
    expect(onSubscribe).toHaveBeenCalledWith('sea@bluesea.com');
    expect(input.value).toBe('');
  });
});
