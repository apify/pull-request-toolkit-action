// import { getOctokit } from '@actions/github';
import { components } from '@octokit/openapi-types/types.d';
import {
    findCurrentTeamMilestone,
    getTeamLabelName,
    // ensureCorrectLinkingAndEstimates,
    getLinkedIssue,
    getLinkedEpics,
    ZenhubTimelineItem,
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

// mtrunkat: I use this one to test the action locally.
/*
describe('ensureCorrectLinkingAndEstimates', () => {
    test('works correctly with a PR', async () => {
        const pullRequest = require('./mocks/pull_request.json'); // eslint-disable-line

        await ensureCorrectLinkingAndEstimates(pullRequest, getOctokit('xxx'));
    });
});
*/
