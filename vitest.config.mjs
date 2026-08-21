import { defineConfig } from 'vitest/config';

const reporters = ['default'];
if (process.env.GITHUB_ACTIONS) {
    reporters.push('github-actions');
}

export default defineConfig({
    test: {
        testTimeout: 10_000,
        reporters,
        alias: [{ find: /^(\..+)\.js$/, replacement: '$1' }],
    },
});
