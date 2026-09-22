import type { Meta, StoryObj } from '@storybook/react-vite';
import HomePage from './HomePage';

const meta = {
  title: 'Pages/HomePage',
  component: HomePage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HomePage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Home Page — the Figma design (1440 frame). */
export const Desktop: Story = {
  parameters: { viewport: { defaultViewport: 'desktop' } },
  globals: { viewport: { value: 'desktop', isRotated: false } },
};

/** 1024–1439px: cards 4-up (2×2 below 1200), reviews stay side by side, type and spacing scale fluidly. */
export const Laptop: Story = {
  parameters: { viewport: { defaultViewport: 'laptop' } },
  globals: { viewport: { value: 'laptop', isRotated: false } },
};

/** 768–1023px: cards 2×2, each review stacks its photo above the quote. */
export const Tablet: Story = {
  parameters: { viewport: { defaultViewport: 'tablet' } },
  globals: { viewport: { value: 'tablet', isRotated: false } },
};

/** < 768px: cards 1-up, reviews stacked. */
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { viewport: { value: 'mobile', isRotated: false } },
};

/** >= 1920px: poster, product band, nav and footer full-bleed; content capped at 1440px and centred. */
export const Large: Story = {
  parameters: { viewport: { defaultViewport: 'large' } },
  globals: { viewport: { value: 'large', isRotated: false } },
};
