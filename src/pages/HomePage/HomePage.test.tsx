/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import HomePage from './HomePage';

afterEach(cleanup);

describe('HomePage', () => {
  it('renders the page landmarks and the poster heading', () => {
    render(<HomePage />);
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Everything For Your Space' })).toBeTruthy();
  });

  it('renders every major section in order', () => {
    render(<HomePage />);
    const main = screen.getByRole('main');
    const titles = within(main)
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);
    expect(titles).toEqual(['Explore Products', 'Product’s Review']);
    expect(screen.getByRole('region', { name: 'Everything For Your Space' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Explore Products' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Product’s Review' })).toBeTruthy();
  });

  it('reuses the Navigation Bar with its Login Button', () => {
    const onLogin = vi.fn();
    render(<HomePage onLogin={onLogin} />);
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('navigation', { name: 'Primary' })).toBeTruthy();
    fireEvent.click(within(banner).getByRole('button', { name: 'Login' }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it('renders four Product Cards with the Figma prices', () => {
    const onAddToCart = vi.fn();
    render(<HomePage onAddToCart={onAddToCart} />);
    const region = screen.getByRole('region', { name: 'Explore Products' });
    expect(within(region).getAllByRole('listitem')).toHaveLength(4);
    expect(within(region).getAllByRole('article')).toHaveLength(4);
    expect(within(region).getAllByText(/^\$/).map((p) => p.textContent)).toEqual([
      '$149.99',
      '$214.01',
      '$149.99',
      '$149.99',
    ]);
    const buttons = within(region).getAllByRole('button', { name: 'Add to Cart' });
    expect(buttons).toHaveLength(4);
    fireEvent.click(buttons[1]);
    expect(onAddToCart).toHaveBeenCalledWith(expect.objectContaining({ price: '$214.01' }));
  });

  it('renders three reviews with photo, quote and author', () => {
    render(<HomePage />);
    const region = screen.getByRole('region', { name: 'Product’s Review' });
    expect(within(region).getAllByRole('figure')).toHaveLength(3);
    expect(within(region).getByRole('img', { name: /speaker/i })).toBeTruthy();
    expect(within(region).getByRole('img', { name: /headphones/i })).toBeTruthy();
    expect(within(region).getByRole('img', { name: /bed/i })).toBeTruthy();
    expect(within(region).getByText('by Jake from Subway Surfers')).toBeTruthy();
    expect(within(region).getByText('by Raze')).toBeTruthy();
    expect(within(region).getByText('by Roronoa Zoro')).toBeTruthy();
    expect(within(region).getByText(/No time to stop/)).toBeTruthy();
  });

  it('reuses the Footer with its Input and Contact Now Button', () => {
    const onSubscribe = vi.fn();
    render(<HomePage onSubscribe={onSubscribe} />);
    const footer = screen.getByRole('contentinfo');
    fireEvent.change(within(footer).getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.click(within(footer).getByRole('button', { name: 'Contact Now' }));
    expect(onSubscribe).toHaveBeenCalledWith('a@b.co');
  });
});
