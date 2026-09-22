/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NoticeCard } from './NoticeCard';

afterEach(cleanup);

describe('NoticeCard', () => {
  it('renders the Notice Card variant', () => {
    render(<NoticeCard />);
    expect(screen.getByRole('heading', { name: 'Notice 1' })).toBeTruthy();
    expect(screen.getByText(/These configuration files allow you/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'More about Notice 1' }).textContent).toBe('more');
  });

  it('fires onAction when the action button is clicked', () => {
    const onAction = vi.fn();
    render(<NoticeCard title="Maintenance" onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'More about Maintenance' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
