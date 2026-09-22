import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './Input';

const meta: Meta<typeof Input> = {
  title: 'Atoms/Input',
  component: Input,
  args: {
    label: 'Label',
    placeholder: 'Enter value',
  },
  argTypes: {
    state: {
      control: 'radio',
      options: ['default', 'filled', 'active', 'disabled', 'error'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: { state: 'default' },
};

export const Filled: Story = {
  args: { state: 'filled', defaultValue: 'Enter value' },
};

export const Active: Story = {
  args: { state: 'active' },
};

export const Disabled: Story = {
  args: { state: 'disabled' },
};

export const Error: Story = {
  args: { state: 'error', errorMessage: 'Error message' },
};
