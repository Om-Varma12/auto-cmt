import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'auto-cmt',
  version: '0.1.0',
  permissions: ['storage', 'unlimitedStorage'],
  host_permissions: [
    'https://cmt3.research.microsoft.com/*',
    'https://ollama.com/*',
    'https://api.tavily.com/*'
  ],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module'
  },
  content_scripts: [
    {
      matches: [
        'https://cmt3.research.microsoft.com/*/Submission/Create*',
        'https://cmt3.research.microsoft.com/*/Track/*/Submission/Create*'
      ],
      js: ['src/content/index.ts'],
      run_at: 'document_idle'
    }
  ],
  action: {
    default_popup: 'index.html'
  },
  options_page: 'options.html'
});
