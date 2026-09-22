/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button } from './Button';

afterEach(cleanup);

describe('Button', () => {
  it('renders the primary, default variant', () => {
    render(<Button variant="primary" state="default">Button</Button>);
    expect(screen.getByRole('button', { name: 'Button' })).toBeTruthy();
  });

  it('renders the primary, hover variant', () => {
    render(<Button variant="primary" state="hover">Button</Button>);
    expect(screen.getByRole('button', { name: 'Button' })).toBeTruthy();
  });

  it('renders the primary, disabled variant', () => {
    render(<Button variant="primary" state="disabled">Button</Button>);
    const button = screen.getByRole('button', { name: 'Button' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });

  it('renders the secondary, default variant', () => {
    render(<Button variant="secondary" state="default">Button</Button>);
    expect(screen.getByRole('button', { name: 'Button' })).toBeTruthy();
  });

  it('renders the secondary, hover variant', () => {
    render(<Button variant="secondary" state="hover">Button</Button>);
    expect(screen.getByRole('button', { name: 'Button' })).toBeTruthy();
  });

  it('renders the secondary, disabled variant', () => {
    render(<Button variant="secondary" state="disabled">Button</Button>);
    const button = screen.getByRole('button', { name: 'Button' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });

  it('fires onClick on a real click when not disabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Button</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Button' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('blocks the click handler when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button state="disabled" onClick={onClick}>
        Button
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Button' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
