import { components } from '@octokit/openapi-types/dist-types/generated/types.d';
import { findMilestone } from './helpers';

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

describe('findMilestone', () => {
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
        const foundMilestone = findMilestone(milestones, 'Platform');
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
        expect(() => findMilestone(milestones, 'Platform')).toThrow('Cannot find milestone for "Platform" team');
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
        expect(() => findMilestone(milestones, 'Platform')).toThrow('Cannot find milestone for "Platform" team');
    });
});
