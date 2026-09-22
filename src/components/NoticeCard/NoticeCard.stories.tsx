import type { Meta, StoryObj } from '@storybook/react-vite';
import { NoticeCard } from './NoticeCard';

const meta: Meta<typeof NoticeCard> = {
  title: 'Components/NoticeCard',
  component: NoticeCard,
  args: {
    title: 'Notice 1',
    description:
      'These configuration files allow you to configure things like your database connection information, your mail server information, as well as various other core configuration values such as your application URL and encryption key.',
    actionLabel: 'more',
  },
  argTypes: {
    onAction: { action: 'action' },
  },
};

export default meta;
type Story = StoryObj<typeof NoticeCard>;

export const NoticeCardDefault: Story = {
  name: 'Notice Card',
};
