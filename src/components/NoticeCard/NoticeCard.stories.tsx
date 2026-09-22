import type { Meta, StoryObj } from '@storybook/react-vite';
import { NoticeCard } from './NoticeCard';

const meta: Meta<typeof NoticeCard> = {
  title: 'Components/NoticeCard',
  component: NoticeCard,
  args: {
    title: 'Notice 1',
    actionLabel: 'more',
  },
};

export default meta;
type Story = StoryObj<typeof NoticeCard>;

export const Default: Story = {};
