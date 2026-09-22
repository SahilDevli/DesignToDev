import type { Meta, StoryObj } from '@storybook/react-vite';
import ProductPage from './ProductPage';

const meta = {
  title: 'Pages/ProductPage',
  component: ProductPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ProductPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Product Page — the Figma design (1440 frame). */
export const Desktop: Story = {
  parameters: { viewport: { defaultViewport: 'desktop' } },
  globals: { viewport: { value: 'desktop', isRotated: false } },
};

/** 1024–1439px: cards 4-up (3-up below 1200), feature stays side by side, type and spacing scale fluidly. */
export const Laptop: Story = {
  parameters: { viewport: { defaultViewport: 'laptop' } },
  globals: { viewport: { value: 'laptop', isRotated: false } },
};

/** 768–1023px: cards 2-up, the sofa photo stacks above its copy and Buttons. */
export const Tablet: Story = {
  parameters: { viewport: { defaultViewport: 'tablet' } },
  globals: { viewport: { value: 'tablet', isRotated: false } },
};

/** < 768px: cards 1-up, feature stacked. */
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { viewport: { value: 'mobile', isRotated: false } },
};

/** >= 1920px: nav and footer full-bleed; content capped at 1440px and centred. */
export const Large: Story = {
  parameters: { viewport: { defaultViewport: 'large' } },
  globals: { viewport: { value: 'large', isRotated: false } },
};
