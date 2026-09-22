import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Footer } from './Footer';

const meta = {
  title: 'Components/Footer',
  component: Footer,
  parameters: { layout: 'fullscreen' },
  args: { onSubscribe: fn() },
} satisfies Meta<typeof Footer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Footer-Desktop (376:631) — 1440×459. */
export const Desktop: Story = {
  parameters: { viewport: { defaultViewport: 'desktop' } },
  globals: { viewport: { value: 'desktop', isRotated: false } },
};

/** Footer-Laptop (404:85) — 1024×459: 58px title, 16px note, 13px links. */
export const Laptop: Story = {
  parameters: { viewport: { defaultViewport: 'laptop' } },
  globals: { viewport: { value: 'laptop', isRotated: false } },
};
