import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from './Card';

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
  args: {
    type: 'Basic',
    title: 'Title',
    description: 'Description text',
  },
  argTypes: {
    type: {
      control: 'radio',
      options: ['Basic', 'Image', 'Stat'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Basic: Story = {
  args: { type: 'Basic' },
};

export const Image: Story = {
  args: { type: 'Image' },
};

export const Stat: Story = {
  args: { type: 'Stat' },
};
