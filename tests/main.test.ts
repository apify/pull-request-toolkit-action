import { afterEach, describe, expect, test, vi } from 'vitest';

import { GitHubModel } from '../src/github_model.ts';
import { main } from '../src/main.ts';
import { PullRequestToolkit } from '../src/pull_request_toolkit.ts';
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
    afterEach(() => {
        vi.restoreAllMocks();
    });

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

    test('does not put a closed pull request back on the team board when the check is re-run', async () => {
        // Re-runs replay the original event payload, so only the freshly fetched pull request shows it is closed.
        vi.spyOn(GitHubModel.prototype, 'getPullRequest').mockResolvedValue({
            state: 'closed',
            merged: true,
            draft: false,
            user: { login: 'VojtaM39' },
            base: { ref: 'master', repo: { default_branch: 'master' } },
        } as never);
        vi.spyOn(PullRequestToolkit.prototype, 'isPullRequestToolkitRequiredForRepo').mockResolvedValue(true);
        vi.spyOn(PullRequestToolkit.prototype, 'linkIssuesMentionedInPullRequestBody').mockResolvedValue();
        const closeIssues = vi
            .spyOn(PullRequestToolkit.prototype, 'closeIssuesMentionedInPullRequestBody')
            .mockResolvedValue();
        vi.spyOn(PullRequestToolkit.prototype, 'findUsersProductEngineeringChildTeamName').mockResolvedValue(
            'Infrastructure',
        );
        vi.spyOn(PullRequestToolkit.prototype, 'isTested').mockResolvedValue(false);
        vi.spyOn(PullRequestToolkit.prototype, 'assignCreator').mockResolvedValue();
        vi.spyOn(PullRequestToolkit.prototype, 'getTeamLabels').mockResolvedValue(['t-infra']);
        const findProject = vi.spyOn(PullRequestToolkit.prototype, 'findProjectForTeam').mockResolvedValue(null);
        const core = { info: vi.fn(), error: vi.fn(), setFailed: vi.fn() } as unknown as Core;
        const getOctokit = vi.fn() as unknown as GetOctokitFunction;

        await main({
            getOctokit,
            context: makeContext(makePullRequest('VojtaM39')),
            core,
            input: { 'org-github-token': 'token', 'apify-api-token': 'token' },
        });

        expect(closeIssues).toHaveBeenCalled();
        expect(findProject).not.toHaveBeenCalled();
        expect(core.setFailed).not.toHaveBeenCalled();
    });
});
