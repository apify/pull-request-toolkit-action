import { describe, expect, test, vi } from 'vitest';

import { LABELS } from '../src/consts.ts';
import type { GitHubModel } from '../src/github_model.ts';
import { PullRequestToolkit } from '../src/pull_request_toolkit.ts';
import type { Core } from '../src/types.ts';

const mockCore = {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
} as unknown as Core;

const basePullRequest = { body: '', labels: [], base: { repo: { owner: { login: 'apify' }, name: 'apify-proxy' } } };
const adhocPullRequest = { ...basePullRequest, labels: [{ name: LABELS.ADHOC }] };

function makeGithubModel(overrides: Partial<GitHubModel> = {}): Partial<GitHubModel> {
    return {
        getPullRequest: vi.fn().mockResolvedValue(basePullRequest),
        getNativelyLinkedIssuesForPullRequest: vi.fn().mockResolvedValue([]),
        getParentIssue: vi.fn().mockResolvedValue(null),
        getProjectItemsForPullRequest: vi.fn().mockResolvedValue([]),
        getProjectItemsForIssue: vi.fn().mockResolvedValue([]),
        // No "Estimate" key at all, which is what GitHub returns when the field was never set.
        getProjectItemFieldValues: vi.fn().mockResolvedValue({}),
        ...overrides,
    };
}

function makeToolkit(githubModel: Partial<GitHubModel>) {
    return new PullRequestToolkit(githubModel as GitHubModel, mockCore, 'apify', 'apify-proxy', 1652);
}

describe('isCorrectlyLinkedAndEstimated', () => {
    test('is not estimated when the linked issue has a project item but no estimate field value set', async () => {
        const githubModel = makeGithubModel({
            getNativelyLinkedIssuesForPullRequest: vi
                .fn()
                .mockResolvedValue([{ owner: 'apify', repo: 'apify-proxy', number: 1627 }]),
            getProjectItemsForIssue: vi.fn().mockResolvedValue([{ id: 'item-1' }]),
        });

        const { isLinkedOrAdhoc, isEstimated } = await makeToolkit(githubModel).isCorrectlyLinkedAndEstimated();

        expect(isLinkedOrAdhoc).toBe(true);
        expect(isEstimated).toBe(false);
    });

    test('is estimated when only a linked issue has the estimate field value set', async () => {
        const githubModel = makeGithubModel({
            getNativelyLinkedIssuesForPullRequest: vi
                .fn()
                .mockResolvedValue([{ owner: 'apify', repo: 'apify-proxy', number: 1627 }]),
            getProjectItemsForPullRequest: vi.fn().mockResolvedValue([{ id: 'pr-item' }]),
            getProjectItemsForIssue: vi.fn().mockResolvedValue([{ id: 'issue-item' }]),
            getProjectItemFieldValues: vi
                .fn()
                .mockImplementation((projectItemId: string) =>
                    Promise.resolve(
                        projectItemId === 'issue-item'
                            ? { Estimate: { id: 'field-1', dataType: 'NUMBER', value: 5 } }
                            : {},
                    ),
                ),
        });

        const { isLinkedOrAdhoc, isEstimated } = await makeToolkit(githubModel).isCorrectlyLinkedAndEstimated();

        expect(isLinkedOrAdhoc).toBe(true);
        expect(isEstimated).toBe(true);
    });

    test('is estimated when the estimate field value is set on the pull request itself', async () => {
        const githubModel = makeGithubModel({
            getPullRequest: vi.fn().mockResolvedValue(adhocPullRequest),
            getProjectItemsForPullRequest: vi.fn().mockResolvedValue([{ id: 'item-1' }]),
            getProjectItemFieldValues: vi
                .fn()
                .mockResolvedValue({ Estimate: { id: 'field-1', dataType: 'NUMBER', value: 3 } }),
        });

        const { isLinkedOrAdhoc, isEstimated } = await makeToolkit(githubModel).isCorrectlyLinkedAndEstimated();

        expect(isLinkedOrAdhoc).toBe(true);
        expect(isEstimated).toBe(true);
    });

    test('is estimated when the estimate field value is zero', async () => {
        const githubModel = makeGithubModel({
            getPullRequest: vi.fn().mockResolvedValue(adhocPullRequest),
            getProjectItemsForPullRequest: vi.fn().mockResolvedValue([{ id: 'item-1' }]),
            getProjectItemFieldValues: vi
                .fn()
                .mockResolvedValue({ Estimate: { id: 'field-1', dataType: 'NUMBER', value: 0 } }),
        });

        const { isEstimated } = await makeToolkit(githubModel).isCorrectlyLinkedAndEstimated();

        expect(isEstimated).toBe(true);
    });

    test('is neither linked/adhoc nor estimated when there are no linked issues, labels, or project items', async () => {
        const githubModel = makeGithubModel();

        const { isLinkedOrAdhoc, isEstimated } = await makeToolkit(githubModel).isCorrectlyLinkedAndEstimated();

        expect(isLinkedOrAdhoc).toBe(false);
        expect(isEstimated).toBe(false);
    });
});

describe('linkIssuesMentionedInPullRequestBody', () => {
    const partOfPullRequest = { ...basePullRequest, node_id: 'PR_1', body: 'Part of #100\nPart of #200' };

    function makeLinkingGithubModel(overrides: Partial<GitHubModel> = {}) {
        return makeGithubModel({
            getPullRequest: vi.fn().mockResolvedValue(partOfPullRequest),
            getIssue: vi
                .fn()
                .mockImplementation((_owner: string, _repo: string, number: number) =>
                    Promise.resolve({ node_id: `I_${number}` }),
                ),
            linkPullRequestToIssue: vi.fn().mockResolvedValue({}),
            ...overrides,
        });
    }

    test('skips issues that are already linked', async () => {
        const githubModel = makeLinkingGithubModel({
            getNativelyLinkedIssuesForPullRequest: vi
                .fn()
                .mockResolvedValue([{ owner: 'apify', repo: 'apify-proxy', number: 100 }]),
        });

        await makeToolkit(githubModel).linkIssuesMentionedInPullRequestBody();

        expect(githubModel.linkPullRequestToIssue).toHaveBeenCalledTimes(1);
        expect(githubModel.linkPullRequestToIssue).toHaveBeenCalledWith('I_200', 'PR_1');
    });

    test('continues with a warning when an issue exceeds the manual reference limit', async () => {
        const githubModel = makeLinkingGithubModel({
            linkPullRequestToIssue: vi
                .fn()
                .mockRejectedValueOnce(
                    new Error(
                        'Request failed due to following response errors:\n - Issue exceeds manual reference limit',
                    ),
                )
                .mockResolvedValueOnce({}),
        });

        await expect(makeToolkit(githubModel).linkIssuesMentionedInPullRequestBody()).resolves.toBeUndefined();

        expect(githubModel.linkPullRequestToIssue).toHaveBeenCalledTimes(2);
        expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('apify/apify-proxy#100'));
    });

    test('rethrows other linking errors', async () => {
        const githubModel = makeLinkingGithubModel({
            linkPullRequestToIssue: vi.fn().mockRejectedValue(new Error('Something else')),
        });

        await expect(makeToolkit(githubModel).linkIssuesMentionedInPullRequestBody()).rejects.toThrow('Something else');
    });
});

describe('closeIssuesMentionedInPullRequestBody', () => {
    async function closedIssuesFor(body: string) {
        const githubModel = makeGithubModel({
            getPullRequest: vi.fn().mockResolvedValue({ ...basePullRequest, body }),
            getIssue: vi.fn().mockResolvedValue({}),
            closeIssueAsCompleted: vi.fn().mockResolvedValue(undefined),
        });
        await makeToolkit(githubModel).closeIssuesMentionedInPullRequestBody();
        return vi.mocked(githubModel.closeIssueAsCompleted!).mock.calls;
    }

    test.each([
        ['Closes #100', ['apify', 'apify-proxy', 100]],
        ['Closes: #100', ['apify', 'apify-proxy', 100]],
        ['Fixes: https://github.com/apify/apify-core/issues/100', ['apify', 'apify-core', 100]],
        ['Closes [#100](https://github.com/apify/apify-core/issues/100)', ['apify', 'apify-core', 100]],
        ['closes [apify-core#100](https://github.com/apify/apify-core/issues/100)', ['apify', 'apify-core', 100]],
        [
            'Resolves: [apify/apify-core#100](https://github.com/apify/apify-core/issues/100)',
            ['apify', 'apify-core', 100],
        ],
    ])('closes the issue referenced by "%s"', async (body, expected) => {
        expect(await closedIssuesFor(body)).toEqual([expected]);
    });

    test.each(['Part of #100', 'Part of: #100', 'Part of [#100](https://github.com/apify/apify-core/issues/100)'])(
        'does not close the issue referenced by "%s"',
        async (body) => {
            expect(await closedIssuesFor(body)).toEqual([]);
        },
    );
});
