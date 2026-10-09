import { afterEach, describe, expect, test, vi } from 'vitest';

import { GitHubModel } from '../src/github_model.ts';
import { main } from '../src/main.ts';
import { PullRequestToolkit } from '../src/pull_request_toolkit.ts';
import type { Context, Core, GetOctokitFunction } from '../src/types.ts';

function makeContext(pullRequest: Record<string, unknown>, { action = 'opened', runAttempt = 1 } = {}) {
    return { payload: { action, pull_request: pullRequest }, runAttempt } as unknown as Context;
}

function makePullRequest(creatorLogin: string, headRepoFullName = 'apify/proxy-chain') {
    return {
        number: 1652,
        user: { login: creatorLogin },
        head: { repo: { full_name: headRepoFullName } },
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
        } as unknown as Awaited<ReturnType<GitHubModel['getPullRequest']>>);
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

    describe('closing issues referenced by a merged pull request', () => {
        function mockMergedPullRequest({ baseRef = 'master' } = {}) {
            vi.spyOn(GitHubModel.prototype, 'getPullRequest').mockResolvedValue({
                state: 'closed',
                merged: true,
                draft: false,
                base: { ref: baseRef, repo: { default_branch: 'master' } },
            } as unknown as Awaited<ReturnType<GitHubModel['getPullRequest']>>);
            vi.spyOn(PullRequestToolkit.prototype, 'isPullRequestToolkitRequiredForRepo').mockResolvedValue(true);
            vi.spyOn(PullRequestToolkit.prototype, 'linkIssuesMentionedInPullRequestBody').mockResolvedValue();
            return vi.spyOn(PullRequestToolkit.prototype, 'closeIssuesMentionedInPullRequestBody').mockResolvedValue();
        }

        const input = { 'org-github-token': 'token', 'apify-api-token': 'token' };

        test.each([
            [
                'from a fork when it is merged',
                makePullRequest('daveomri', 'daveomri/proxy-chain'),
                { action: 'closed' },
            ],
            [
                'from a fork when the check is re-run after the merge',
                makePullRequest('daveomri', 'daveomri/proxy-chain'),
                { runAttempt: 2 },
            ],
            ['from a bot', makePullRequest('apify-service-account'), {}],
        ])('closes them for a pull request %s', async (_, pullRequest, contextOptions) => {
            const closeIssues = mockMergedPullRequest();
            const core = { info: vi.fn(), error: vi.fn(), setFailed: vi.fn() } as unknown as Core;

            await main({
                getOctokit: vi.fn() as unknown as GetOctokitFunction,
                context: makeContext(pullRequest, contextOptions),
                core,
                input,
            });

            expect(closeIssues).toHaveBeenCalled();
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        test('does not close them for a pull request from a fork whose body is edited after the merge', async () => {
            const closeIssues = mockMergedPullRequest();
            const core = { info: vi.fn(), error: vi.fn(), setFailed: vi.fn() } as unknown as Core;

            await main({
                getOctokit: vi.fn() as unknown as GetOctokitFunction,
                context: makeContext(makePullRequest('daveomri', 'daveomri/proxy-chain'), { action: 'edited' }),
                core,
                input,
            });

            expect(closeIssues).not.toHaveBeenCalled();
        });

        test('does not close them for a pull request merged into a non-default branch', async () => {
            const closeIssues = mockMergedPullRequest({ baseRef: 'feature' });
            const core = { info: vi.fn(), error: vi.fn(), setFailed: vi.fn() } as unknown as Core;

            await main({
                getOctokit: vi.fn() as unknown as GetOctokitFunction,
                context: makeContext(makePullRequest('VojtaM39')),
                core,
                input,
            });

            expect(closeIssues).not.toHaveBeenCalled();
        });

        test('skips a pull request from a fork without failing when the secrets are not available', async () => {
            const core = { info: vi.fn(), error: vi.fn(), setFailed: vi.fn() } as unknown as Core;
            const getOctokit = vi.fn() as unknown as GetOctokitFunction;

            await main({
                getOctokit,
                context: makeContext(makePullRequest('daveomri', 'daveomri/proxy-chain')),
                core,
                input: {},
            });

            expect(getOctokit).not.toHaveBeenCalled();
            expect(core.setFailed).not.toHaveBeenCalled();
        });
    });
});
