/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Card } from './Card';

afterEach(cleanup);

describe('Card', () => {
  it('renders the Basic variant', () => {
    render(<Card type="Basic" />);
    expect(screen.getByRole('heading', { name: 'Title' })).toBeTruthy();
    expect(screen.getByText('Description text')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View documentation' })).toBeTruthy();
  });

  it('renders the Image variant', () => {
    render(<Card type="Image" />);
    expect(screen.getByRole('heading', { name: 'Title' })).toBeTruthy();
    expect(screen.getByText('Description text')).toBeTruthy();
    expect(screen.getByText('Productivity')).toBeTruthy();
  });

  it('renders the Stat variant', () => {
    render(<Card type="Stat" />);
    expect(screen.getByRole('heading', { name: 'Title' })).toBeTruthy();
    expect(screen.getByText('Description text')).toBeTruthy();
    expect(screen.getByText('12.4%')).toBeTruthy();
    expect(screen.getByText('since last month')).toBeTruthy();
  });

  it('fires onLinkClick when the Basic link is clicked', () => {
    const onLinkClick = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(<Card type="Basic" href="/docs" onLinkClick={onLinkClick} />);
    const link = screen.getByRole('link', { name: 'View documentation' });
    expect(link.getAttribute('href')).toBe('/docs');
    fireEvent.click(link);
    expect(onLinkClick).toHaveBeenCalledTimes(1);
  });
});
