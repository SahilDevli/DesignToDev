/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProductCard } from './ProductCard';

afterEach(cleanup);

describe('ProductCard', () => {
  it('renders the Default state', () => {
    render(<ProductCard state="Default" />);
    expect(screen.getByRole('heading', { name: 'SoundWave Pro' })).toBeTruthy();
    expect(screen.getByText('$149.99')).toBeTruthy();
    expect(screen.getByText('4.8 (128 reviews)')).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Rate this product' })).toBeTruthy();
    expect(screen.getByRole('article').getAttribute('aria-disabled')).toBeNull();
  });

  it('renders the Hover state', () => {
    render(<ProductCard state="Hover" />);
    expect(screen.getByRole('heading', { name: 'SoundWave Pro' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeTruthy();
  });

  it('renders the Disabled state', () => {
    render(<ProductCard state="Disabled" />);
    expect(screen.getByRole('heading', { name: 'SoundWave Pro' })).toBeTruthy();
    expect(screen.getByRole('article').getAttribute('aria-disabled')).toBe('true');
    expect((screen.getByRole('button', { name: 'Add to Cart' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('img', { name: 'Rated 5 out of 5' })).toBeTruthy();
  });

  it('adds to cart on click and commits a star rating', () => {
    const onAddToCart = vi.fn();
    const onRatingChange = vi.fn();
    render(<ProductCard onAddToCart={onAddToCart} onRatingChange={onRatingChange} defaultValue={0} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));
    expect(onAddToCart).toHaveBeenCalledTimes(1);

    const third = screen.getByRole('radio', { name: '3 stars' });
    fireEvent.click(third);
    expect(onRatingChange).toHaveBeenCalledWith(3);
    expect(third.getAttribute('aria-checked')).toBe('true');

    fireEvent.keyDown(third, { key: 'ArrowRight' });
    expect(onRatingChange).toHaveBeenLastCalledWith(4);
    expect(screen.getByRole('radio', { name: '4 stars' }).getAttribute('aria-checked')).toBe('true');
  });
});
