/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SearchBar } from './SearchBar';

afterEach(cleanup);

describe('SearchBar', () => {
  it('renders the default variant', () => {
    render(<SearchBar state="default" placeholder="search here" />);
    expect(screen.getByPlaceholderText('search here')).toBeTruthy();
    expect(screen.getByRole('search')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
  });

  it('renders the focus variant', () => {
    render(<SearchBar state="focus" placeholder="search here" />);
    expect(screen.getByPlaceholderText('search here')).toBeTruthy();
  });

  it('moves from default to focus on real focus/blur, uncontrolled', () => {
    render(<SearchBar />);
    const input = screen.getByRole('searchbox');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'shoes' } });
    expect((input as HTMLInputElement).value).toBe('shoes');

    fireEvent.blur(input);
  });

  it('calls onSearch with the current value when the form is submitted', () => {
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    const input = screen.getByRole('searchbox');
    const button = screen.getByRole('button', { name: 'Search' });

    fireEvent.change(input, { target: { value: 'jacket' } });
    fireEvent.click(button);

    expect(onSearch).toHaveBeenCalledWith('jacket');
  });
});
