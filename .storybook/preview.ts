import type { Preview } from '@storybook/react-vite';
import '../src/designToken.css';
import '../src/index.css';

const preview: Preview = {
  parameters: {
    /* DesignToDev — widths match the Figma breakpoints the pipelines use */
    viewport: {
      options: {
        mobile: {
          name: 'mobile (375px)',
          styles: { width: '375px', height: '900px' },
          type: 'mobile',
        },
        tablet: {
          name: 'tablet (768px)',
          styles: { width: '768px', height: '900px' },
          type: 'tablet',
        },
        laptop: {
          name: 'laptop (1024px)',
          styles: { width: '1024px', height: '900px' },
          type: 'desktop',
        },
        desktop: {
          name: 'desktop (1440px)',
          styles: { width: '1440px', height: '900px' },
          type: 'desktop',
        },
        large: {
          name: 'large (1920px)',
          styles: { width: '1920px', height: '900px' },
          type: 'desktop',
        },
      },
    },
    options: {
      storySort: { order: ['Overview', 'Atoms', 'Components', 'Pages'] },
    },

    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
