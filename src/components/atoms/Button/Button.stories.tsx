import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Atoms/Button',
  component: Button,
  args: {
    children: 'Button',
    variant: 'primary',
  },
  argTypes: {
    variant: {
      control: 'radio',
      options: ['primary', 'secondary'],
    },
    state: {
      control: 'radio',
      options: ['default', 'hover', 'disabled'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const PrimaryDefault: Story = {
  args: { variant: 'primary', state: 'default' },
};

export const PrimaryHover: Story = {
  args: { variant: 'primary', state: 'hover' },
};

export const PrimaryDisabled: Story = {
  args: { variant: 'primary', state: 'disabled' },
};

export const SecondaryDefault: Story = {
  args: { variant: 'secondary', state: 'default' },
};

export const SecondaryHover: Story = {
  args: { variant: 'secondary', state: 'hover' },
};

export const SecondaryDisabled: Story = {
  args: { variant: 'secondary', state: 'disabled' },
};
