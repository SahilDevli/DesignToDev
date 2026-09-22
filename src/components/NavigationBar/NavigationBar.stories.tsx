import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { NavigationBar } from './NavigationBar';

const meta = {
  title: 'Components/NavigationBar',
  component: NavigationBar,
  parameters: { layout: 'fullscreen' },
  // The bar is 10% white over the page, so preview it on a dark canvas.
  globals: { backgrounds: { value: 'dark' } },
  args: { onLogin: fn() },
} satisfies Meta<typeof NavigationBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Navigation-Desktop (367:8) — 1440×95: 43px logo, 22px links. */
export const Desktop: Story = {
  parameters: { viewport: { defaultViewport: 'desktop' } },
  globals: { viewport: { value: 'desktop', isRotated: false } },
};

/** Navigation-Laptop (402:68) — 1024×95: 40px logo, 18px links. */
export const Laptop: Story = {
  parameters: { viewport: { defaultViewport: 'laptop' } },
  globals: { viewport: { value: 'laptop', isRotated: false } },
};
