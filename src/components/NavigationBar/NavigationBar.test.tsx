/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NavigationBar } from './NavigationBar';

afterEach(cleanup);

function expectNavigationContent() {
  const header = screen.getByRole('banner');
  expect(within(header).getByRole('link', { name: 'Blue Sea Global' })).toBeTruthy();
  const nav = within(header).getByRole('navigation', { name: 'Primary' });
  for (const label of ['Home', 'Products', 'Trend', 'Help & Support']) {
    expect(within(nav).getByRole('link', { name: label })).toBeTruthy();
  }
  expect(within(header).getByRole('button', { name: 'Login' })).toBeTruthy();
}

describe('NavigationBar', () => {
  // Desktop and Laptop are the same markup; the breakpoint is CSS-only.
  it('renders the Desktop variant', () => {
    render(<NavigationBar />);
    expectNavigationContent();
  });

  it('renders the Laptop variant', () => {
    render(<NavigationBar />);
    expectNavigationContent();
  });

  it('calls onLogin when Login is clicked', () => {
    const onLogin = vi.fn();
    render(<NavigationBar onLogin={onLogin} />);
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Help & Support' }).getAttribute('href')).toBe('#help-support');
  });
});
