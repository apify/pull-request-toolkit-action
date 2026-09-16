import { describe, expect, test, vi } from 'vitest';

import { main } from '../src/main.ts';
import type { Context, Core, GetOctokitFunction } from '../src/types.ts';

function makeContext(pullRequest: Record<string, unknown>) {
    return { payload: { pull_request: pullRequest } } as unknown as Context;
}

function makePullRequest(creatorLogin: string) {
    return {
        number: 1652,
        user: { login: creatorLogin },
        head: { repo: { full_name: 'apify/proxy-chain' } },
        base: { repo: { full_name: 'apify/proxy-chain', owner: { login: 'apify' }, name: 'proxy-chain' } },
    };
}

describe('main', () => {
    test('skips pull requests from Dependabot, which run without access to the Actions secrets', async () => {
        const core = { info: vi.fn(), error: vi.fn(), setFailed: vi.fn() } as unknown as Core;
        const getOctokit = vi.fn() as unknown as GetOctokitFunction;

        await main({ getOctokit, context: makeContext(makePullRequest('dependabot[bot]')), core, input: {} });

        expect(getOctokit).not.toHaveBeenCalled();
        expect(core.setFailed).not.toHaveBeenCalled();
    });

    test('fails on a missing org token for pull requests from humans', async () => {
        const core = { info: vi.fn(), error: vi.fn(), setFailed: vi.fn() } as unknown as Core;
        const getOctokit = vi.fn() as unknown as GetOctokitFunction;

        await main({ getOctokit, context: makeContext(makePullRequest('VojtaM39')), core, input: {} });

        expect(core.setFailed).toHaveBeenCalledWith('Missing org-github-token input!');
    });
});
