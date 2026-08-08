import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

const config: Config = {
  title: 'Momentum Docs',
  tagline: 'Reference documentation for the Momentum platform.',
  favicon: 'img/favicon.ico',

  url: 'https://momentum.example.com',
  baseUrl: '/docs/',

  organizationName: 'momentum',
  projectName: 'momentum',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          path: 'docs',
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: undefined,
          showLastUpdateAuthor: false,
          showLastUpdateTime: false,
        },
        blog: false,
        pages: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      },
    ],
  ],

  themeConfig: {
    image: 'img/social-card.png',
    navbar: {
      title: 'Momentum',
      logo: {
        alt: 'Momentum Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'main',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://modelcontextprotocol.io/',
          label: 'MCP',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Getting Started',
          items: [
            { label: 'Overview', to: '/' },
            { label: 'Connect Your AI Client', to: '/guides/connect-your-ai-client' },
          ],
        },
        {
          title: 'Reference',
          items: [
            { label: 'Auth and Modes', to: '/reference/auth-and-modes' },
            { label: 'Tool Surface', to: '/reference/tools' },
            { label: 'Resources and Prompts', to: '/reference/resources-and-prompts' },
          ],
        },
        {
          title: 'Trust',
          items: [
            { label: 'Why Trust It', to: '/guides/why-trust-this-service' },
            { label: 'Security FAQ', to: '/guides/security-faq' },
            { label: 'Adoption Checklist', to: '/guides/adoption-checklist' },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Momentum`,
    },
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: true,
      },
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json'],
    },
  },
};

export default config;
