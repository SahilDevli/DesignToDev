import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProductCard } from './ProductCard';

const meta: Meta<typeof ProductCard> = {
  title: 'Components/ProductCard',
  component: ProductCard,
  args: {
    state: 'Default',
    productName: 'SoundWave Pro',
    price: '$149.99',
    description: 'Immersive spatial audio with hybrid active noise cancellation.',
    ratingLabel: '4.8 (128 reviews)',
    defaultValue: 5,
    readOnly: false,
  },
  argTypes: {
    state: {
      control: 'radio',
      options: ['Default', 'Hover', 'Disabled'],
    },
    onAddToCart: { action: 'addToCart' },
    onRatingChange: { action: 'ratingChange' },
  },
};

export default meta;
type Story = StoryObj<typeof ProductCard>;

export const Default: Story = {
  args: { state: 'Default' },
};

export const Hover: Story = {
  args: { state: 'Hover' },
};

export const Disabled: Story = {
  args: { state: 'Disabled' },
};
