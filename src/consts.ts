export const ORGANIZATION = 'apify';

export const PARENT_TEAM_SLUG = 'product-engineering';

export const ZENHUB_WORKSPACE_ID = '5f6454160d9f82000fa6733f';

export const ZENHUB_WORKSPACE_NAME = 'Platform Team';

export const TEAM_LABEL_PREFIX = 't-';

export const TEAM_NAME_TO_LABEL: { [name: string]: string} = {
    'Cash & Community': 't-c&c',
};

export const LINKING_CHECK_RETRIES = 8;
export const LINKING_CHECK_DELAY_MILLIS = 15 * 1000;

export const TEAMS_NOT_USING_ZENHUB = ['put-some-team-here', 'Service Account'];

// Excludes the team from the milestone, correct linking and estimate checks.
export const SKIP_MILESTONES_AND_ESTIMATES_FOR_TEAMS = ['Docs', 'Service Account', 'AI'];

export const TESTED_LABEL_NAME = 'tested';
