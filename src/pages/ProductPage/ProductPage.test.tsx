/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ProductPage from './ProductPage';

afterEach(cleanup);

describe('ProductPage', () => {
  it('renders the page landmarks and a page heading', () => {
    render(<ProductPage />);
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Products' })).toBeTruthy();
  });

  it('renders every major section in order', () => {
    render(<ProductPage />);
    const main = screen.getByRole('main');
    const titles = within(main)
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);
    expect(titles).toEqual(['Home Tech Collection', 'Elevate your space with comfort.', 'Fine Furnishings']);
    expect(screen.getByRole('region', { name: 'Home Tech Collection' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Elevate your space with comfort.' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Fine Furnishings' })).toBeTruthy();
  });

  it('reuses the Navigation Bar with its Login Button', () => {
    const onLogin = vi.fn();
    render(<ProductPage onLogin={onLogin} />);
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('navigation', { name: 'Primary' })).toBeTruthy();
    fireEvent.click(within(banner).getByRole('button', { name: 'Login' }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it('reuses the Search Bar', () => {
    const onSearch = vi.fn();
    render(<ProductPage onSearch={onSearch} />);
    const search = within(screen.getByRole('main')).getByRole('search');
    fireEvent.change(within(search).getByRole('searchbox', { name: 'Search' }), { target: { value: 'sofa' } });
    fireEvent.click(within(search).getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenCalledWith('sofa');
  });

  it.each(['Home Tech Collection', 'Fine Furnishings'])('renders eight Product Cards in "%s"', (name) => {
    const onAddToCart = vi.fn();
    render(<ProductPage onAddToCart={onAddToCart} />);
    const region = screen.getByRole('region', { name });
    expect(within(region).getAllByRole('listitem')).toHaveLength(8);
    expect(within(region).getAllByRole('article')).toHaveLength(8);
    const buttons = within(region).getAllByRole('button', { name: 'Add to Cart' });
    expect(buttons).toHaveLength(8);
    fireEvent.click(buttons[2]);
    expect(onAddToCart).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'SoundWave Pro', price: '$149.99' }),
    );
  });

  it('renders the featured sofa with its photo, copy and two Buttons', () => {
    const onAddFeaturedToCart = vi.fn();
    const onViewDetails = vi.fn();
    render(<ProductPage onAddFeaturedToCart={onAddFeaturedToCart} onViewDetails={onViewDetails} />);
    const region = screen.getByRole('region', { name: 'Elevate your space with comfort.' });
    expect(within(region).getByRole('img', { name: /sofa/i })).toBeTruthy();
    expect(within(region).getByText(/Crafted for modern living/)).toBeTruthy();
    fireEvent.click(within(region).getByRole('button', { name: 'Add to Cart' }));
    fireEvent.click(within(region).getByRole('button', { name: 'View Details' }));
    expect(onAddFeaturedToCart).toHaveBeenCalledTimes(1);
    expect(onViewDetails).toHaveBeenCalledTimes(1);
  });

  it('reuses the Footer with its Input and Contact Now Button', () => {
    const onSubscribe = vi.fn();
    render(<ProductPage onSubscribe={onSubscribe} />);
    const footer = screen.getByRole('contentinfo');
    fireEvent.change(within(footer).getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.click(within(footer).getByRole('button', { name: 'Contact Now' }));
    expect(onSubscribe).toHaveBeenCalledWith('a@b.co');
  });
});
