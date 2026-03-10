// import { getOctokit } from '@actions/github';
import { components } from '@octokit/openapi-types';

import {
    findCurrentTeamMilestone,
    getTeamLabelName,
    // ensureCorrectLinkingAndEstimates,
    // isRepoIncludedInZenHubWorkspace,
    getLinkedIssue,
    getLinkedEpics,
    ZenhubTimelineItem,
    isTestFilePath,
    retry,
    assignPrToProjectSprint,
} from './helpers';

jest.mock('./consts', () => ({
    ...jest.requireActual('./consts'),
    TEAM_TO_PROJECT_NUMBER: { 'Core Services': 42 },
    SPRINT_FIELD_NAME: 'Sprint',
}));

type Milestone = components['schemas']['milestone'];

const BASE_MILESTONE = {
    node_id: '',
    url: '',
    html_url: '',
    labels_url: '',
    id: 20,
    number: 20,
    description: '',
    open_issues: 9,
    closed_issues: 19,
    state: 'open',
    created_at: '2021-05-10T07:53:55Z',
    updated_at: '2021-05-24T12:13:32Z',
    closed_at: '2021-05-24T12:13:32Z',
    creator: null,
};

describe('findCurrentTeamMilestone', () => {
    test('selects correct milestone based on a team name', () => {
        const milestones: Milestone[] = [
            {
                ...BASE_MILESTONE,
                state: 'open',
                title: '14th Sprint - Console team',
                due_on: (new Date(Date.now() + 24 * 3600 * 1000)).toISOString(), // Must be in the future
            },
            {
                ...BASE_MILESTONE,
                state: 'open',
                title: '14th Sprint - Core Services team',
                due_on: (new Date(Date.now() + 24 * 3600 * 1000)).toISOString(), // Must be in the future
            },
            {
                ...BASE_MILESTONE,
                state: 'open',
                title: '14th Sprint - Web team',
                due_on: (new Date(Date.now() + 24 * 3600 * 1000)).toISOString(), // Must be in the future
            },
        ];
        const foundMilestone = findCurrentTeamMilestone(milestones, 'Core Services');
        expect(foundMilestone?.title).toBe('14th Sprint - Core Services team');
    });

    test('ignores closed milestones', () => {
        const milestones: Milestone[] = [
            {
                ...BASE_MILESTONE,
                state: 'closed',
                title: '13th Sprint - Core Services team',
                due_on: (new Date(Date.now() + 24 * 3600 * 1000)).toISOString(), // Must be in the future
            },
        ];
        expect(() => findCurrentTeamMilestone(milestones, 'Core Services')).toThrow('Cannot find milestone for "Core Services" team');
    });

    test('ignores past milestones', () => {
        const milestones: Milestone[] = [
            {
                ...BASE_MILESTONE,
                state: 'open',
                title: '13th Sprint - Core Services team',
                due_on: '2021-05-23T07:00:00Z',
            },
        ];
        expect(() => findCurrentTeamMilestone(milestones, 'Core Services')).toThrow('Cannot find milestone for "Core Services" team');
    });
});

describe('getTeamLabelName', () => {
    test('works correctly for single word', () => {
        expect(getTeamLabelName('Core Services')).toBe('t-core-services');
    });
    test('works correctly for Cash & Community', () => {
        expect(getTeamLabelName('Cash & Community')).toBe('t-c&c');
    });
});

describe('ZenHub events extractors', () => {
    const TEST_EVENTS = require('./mocks/zenhub_events.json') as ZenhubTimelineItem[]; // eslint-disable-line

    test('getLinkedIssue', () => {
        expect(getLinkedIssue(TEST_EVENTS)).toEqual({
            id: 258575726,
            type: 'GithubIssue',
            state: 'open',
            title: 'Dependency Dashboard',
            number: 493,
            repo: {
                gh_id: 264953367,
                id: 132804227,
                name: 'apify-proxy',
            },
        });
    });
    test('getLinkedEpics', () => {
        expect(getLinkedEpics(TEST_EVENTS)).toEqual([
            {
                id: 258519658,
                type: 'GithubIssue',
                state: 'closed',
                title: 'Prepare web codebase for DARK MODE',
                number: 9417,
            },
            {
                id: 258519859,
                type: 'GithubIssue',
                state: 'open',
                title: 'AppMixer: Airtable',
                number: 9419,
            },
        ]);
    });
});

describe('isTestFilePath', () => {
    test('works with filenames', () => {
        expect(isTestFilePath('/dasdasd.test.js')).toBe(true);
        expect(isTestFilePath('asdasdlddd.ahoj.ss')).toBe(false);
        expect(isTestFilePath('bla.test.py')).toBe(true);
        expect(isTestFilePath('some-dir/another/test.py')).toBe(true);
        expect(isTestFilePath('asds/test/test.js')).toBe(true);
        expect(isTestFilePath('inte')).toBe(false);
        expect(isTestFilePath('bla.tests.py')).toBe(true);
        expect(isTestFilePath('testk.py')).toBe(true);
        expect(isTestFilePath('asds/test/test.js')).toBe(true);
        expect(isTestFilePath('ahoj.mjs')).toBe(false);
        expect(isTestFilePath('ahoj/test.mjs')).toBe(true);
        expect(isTestFilePath('ahoj/zdar/tests.py')).toBe(true);
        expect(isTestFilePath('my.tests.mjs')).toBe(true);
        expect(isTestFilePath('ahoj/test_basic.py')).toBe(true);
        expect(isTestFilePath('simething/jknkjnkj/js')).toBe(false);
        expect(isTestFilePath('test/jknkjnkj/js')).toBe(true);
        expect(isTestFilePath('/test/jknkjnkj/js')).toBe(true);
    });

    test('works with directories', () => {
        expect(isTestFilePath('something/test/something')).toBe(true);
        expect(isTestFilePath('something/tests/something')).toBe(true);
        expect(isTestFilePath('something/non-test/something')).toBe(false);
    });
});

describe('retry', () => {
    test('works correctly when succeeds', async () => {
        let counter = 0;

        await retry(async () => {
            counter++;

            if (counter < 3) throw new Error('Some error');
        }, 5, 10);

        expect(counter).toBe(3);
    });

    test('works correctly when a failure occurs', async () => {
        let counter = 0;
        let lastAttemptCalls = 0;

        await expect(
            retry(async (isLastAttempt) => {
                if (isLastAttempt) lastAttemptCalls++;
                counter++;
                throw new Error('Some error');
            }, 5, 10),
        ).rejects.toEqual(new Error('Some error'));

        expect(counter).toBe(6);
        expect(lastAttemptCalls).toBe(1);
    });
});

describe('assignPrToProjectSprint', () => {
    const MOCK_PR = { node_id: 'PR_node_id_123' } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    test('throws when team has no project configured', async () => {
        const mockOctokit = { graphql: jest.fn() } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        await expect(assignPrToProjectSprint(mockOctokit, MOCK_PR, 'Unknown Team')).rejects.toThrow(
            'No GitHub Project configured for team "Unknown Team"',
        );
        expect(mockOctokit.graphql).not.toHaveBeenCalled();
    });

    test('adds PR to project and sets current sprint', async () => {
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 3); // started 3 days ago

        const mockOctokit = {
            graphql: jest.fn()
                // 1st call: getProjectNodeId
                .mockResolvedValueOnce({ organization: { projectV2: { id: 'PROJECT_NODE_ID' } } })
                // 2nd call: findCurrentSprintIteration
                .mockResolvedValueOnce({
                    node: {
                        fields: {
                            nodes: [
                                {
                                    id: 'FIELD_ID',
                                    name: 'Sprint',
                                    configuration: {
                                        iterations: [
                                            {
                                                id: 'ITER_ID',
                                                title: 'Sprint 10',
                                                startDate: startDate.toISOString().split('T')[0],
                                                duration: 14,
                                            },
                                        ],
                                    },
                                },
                            ],
                        },
                    },
                })
                // 3rd call: addPrToProject
                .mockResolvedValueOnce({ addProjectV2ItemById: { item: { id: 'ITEM_ID' } } })
                // 4th call: setProjectItemSprint
                .mockResolvedValueOnce({}),
        } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

        const sprintTitle = await assignPrToProjectSprint(mockOctokit, MOCK_PR, 'Core Services');

        expect(sprintTitle).toBe('Sprint 10');
        expect(mockOctokit.graphql).toHaveBeenCalledTimes(4);

        // Verify addPrToProject was called with correct PR node ID
        expect(mockOctokit.graphql).toHaveBeenNthCalledWith(3, expect.any(String), {
            projectId: 'PROJECT_NODE_ID',
            contentId: 'PR_node_id_123',
        });

        // Verify setProjectItemSprint was called with resolved IDs
        expect(mockOctokit.graphql).toHaveBeenNthCalledWith(4, expect.any(String), {
            projectId: 'PROJECT_NODE_ID',
            itemId: 'ITEM_ID',
            fieldId: 'FIELD_ID',
            iterationId: 'ITER_ID',
        });
    });

    test('throws when no Sprint field exists in project', async () => {
        const mockOctokit = {
            graphql: jest.fn()
                .mockResolvedValueOnce({ organization: { projectV2: { id: 'PROJECT_NODE_ID' } } })
                .mockResolvedValueOnce({
                    node: { fields: { nodes: [{ id: 'f1', name: 'Status' }] } },
                }),
        } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

        await expect(assignPrToProjectSprint(mockOctokit, MOCK_PR, 'Core Services')).rejects.toThrow(
            'No iteration field named "Sprint" found in project',
        );
    });

    test('throws when no active sprint iteration exists', async () => {
        const pastStart = new Date();
        pastStart.setDate(pastStart.getDate() - 30); // started 30 days ago, duration 14 → already ended

        const mockOctokit = {
            graphql: jest.fn()
                .mockResolvedValueOnce({ organization: { projectV2: { id: 'PROJECT_NODE_ID' } } })
                .mockResolvedValueOnce({
                    node: {
                        fields: {
                            nodes: [
                                {
                                    id: 'FIELD_ID',
                                    name: 'Sprint',
                                    configuration: {
                                        iterations: [
                                            {
                                                id: 'OLD_ITER',
                                                title: 'Sprint 9',
                                                startDate: pastStart.toISOString().split('T')[0],
                                                duration: 14,
                                            },
                                        ],
                                    },
                                },
                            ],
                        },
                    },
                }),
        } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

        await expect(assignPrToProjectSprint(mockOctokit, MOCK_PR, 'Core Services')).rejects.toThrow(
            'No active sprint found in project field "Sprint"',
        );
    });
});

// mtrunkat: I use these to test the action locally.
/*
describe('ensureCorrectLinkingAndEstimates', () => {
    test('works correctly with a PR', async () => {
        const pullRequest = require('./mocks/pull_request.json'); // eslint-disable-line
        const octokit = getOctokit('xxx');

        await ensureCorrectLinkingAndEstimates(pullRequest, octokit, false);
    });
});

describe('isPullRequestTested', () => {
    test('correctly returns true for tested PR', async () => {
        const pullRequest = require('./mocks/pull_request.json'); // eslint-disable-line
        console.log(await isPullRequestTested(getOctokit('xxx'), pullRequest));
    });
});

describe('isRepoIncludedInZenHubWorkspace', () => {
    test('works correctly with a PR', async () => {
        const pullRequest = require('./mocks/pull_request.json'); // eslint-disable-line
        console.log(await isRepoIncludedInZenHubWorkspace(pullRequest.base.repo.name));
    });
});
*/
