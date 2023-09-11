// import { getOctokit } from '@actions/github';
import { components } from '@octokit/openapi-types/types.d';
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
} from './helpers';

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
                title: '14th Sprint - Platform team',
                due_on: (new Date(Date.now() + 24 * 3600 * 1000)).toISOString(), // Must be in the future
            },
            {
                ...BASE_MILESTONE,
                state: 'open',
                title: '14th Sprint - Web team',
                due_on: (new Date(Date.now() + 24 * 3600 * 1000)).toISOString(), // Must be in the future
            },
        ];
        const foundMilestone = findCurrentTeamMilestone(milestones, 'Platform');
        expect(foundMilestone?.title).toBe('14th Sprint - Platform team');
    });

    test('ignores closed milestones', () => {
        const milestones: Milestone[] = [
            {
                ...BASE_MILESTONE,
                state: 'closed',
                title: '13th Sprint - Platform team',
                due_on: (new Date(Date.now() + 24 * 3600 * 1000)).toISOString(), // Must be in the future
            },
        ];
        expect(() => findCurrentTeamMilestone(milestones, 'Platform')).toThrow('Cannot find milestone for "Platform" team');
    });

    test('ignores past milestones', () => {
        const milestones: Milestone[] = [
            {
                ...BASE_MILESTONE,
                state: 'open',
                title: '13th Sprint - Platform team',
                due_on: '2021-05-23T07:00:00Z',
            },
        ];
        expect(() => findCurrentTeamMilestone(milestones, 'Platform')).toThrow('Cannot find milestone for "Platform" team');
    });
});

describe('getTeamLabelName', () => {
    test('works correctly for single word', () => {
        expect(getTeamLabelName('Platform')).toBe('t-platform');
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
