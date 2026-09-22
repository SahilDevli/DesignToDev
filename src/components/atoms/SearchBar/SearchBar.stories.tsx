import type { Meta, StoryObj } from '@storybook/react-vite';
import { SearchBar } from './SearchBar';

const meta: Meta<typeof SearchBar> = {
  title: 'Atoms/SearchBar',
  component: SearchBar,
  args: {
    placeholder: 'search here',
  },
  argTypes: {
    state: {
      control: 'radio',
      options: ['default', 'focus'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof SearchBar>;

export const Default: Story = {
  args: { state: 'default' },
};

export const Focus: Story = {
  args: { state: 'focus' },
};
