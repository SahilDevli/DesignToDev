import type { Meta, StoryObj } from '@storybook/react-vite';
import { Toster } from './Toster';

const meta: Meta<typeof Toster> = {
  title: 'Components/Toster',
  component: Toster,
  args: {
    message: 'Login Successful!',
  },
};

export default meta;
type Story = StoryObj<typeof Toster>;

export const Default: Story = {};
