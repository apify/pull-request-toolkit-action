import * as core from '@actions/core';
import { components } from '@octokit/openapi-types/dist-types/generated/types.d';
import { Octokit } from '@octokit/core/dist-types';
import { Context } from '@actions/github/lib/context.d';

type Milestone = components['schemas']['milestone'];
type Assignee = components['schemas']['simple-user'];
type PullRequest = components['schemas']['pull-request'];

const ORGANIZATION = 'apify';
const PARENT_TEAM_SLUG = 'platform-team';

/**
 * Iterates over child teams of a team PARENT_TEAM_SLUG and returns team name where user belongs to.
 */
export async function findUsersTeamName(orgOctokit: Octokit, userLogin: string): Promise<string | null> {
    const { data: childTeams } = await orgOctokit.rest.teams.listChildInOrg({
        org: ORGANIZATION,
        team_slug: PARENT_TEAM_SLUG,
    });
    if (!childTeams.length) throw new Error('No child teams found!');

    let teamName = null;
    for (const childTeam of childTeams) {
        const { data: members } = await orgOctokit.rest.teams.listMembersInOrg({
            org: ORGANIZATION,
            team_slug: childTeam.slug,
        });

        const isMember = !!members.find((member: any) => member?.login === userLogin);
        if (isMember) {
            teamName = childTeam.name;
            core.info(`User ${userLogin} belongs to a team ${teamName}`);
            break;
        }
    }

    return teamName;
};

/**
 * Finds a current milestone for a given team.
 * Milestone name must contain a team name and have correct start and end dates.
 */
export function findMilestone(milestones: Milestone[], teamName: string): Milestone {
    const now = new Date();

    // All open milestones
    const openMilestones: Milestone[] = milestones.filter((milestone: Milestone) => {
        return milestone.state === 'open'
            && milestone.due_on
            && new Date(milestone.due_on) >= now;
    });

    // Find milestone for the team, if team name was provided
    const teamNameRegExp = new RegExp(teamName, 'i');
    const foundMilestone = openMilestones.find((milestone: Milestone) => {
        return milestone.title.match(teamNameRegExp);
    });
    if (!foundMilestone) throw new Error(`Cannot find milestone for "${teamName}" team`);

    return foundMilestone;
};

/**
 * Configures PR assignee to be the same as PR creater.
 */
export async function assignPrCreator(context: Context, octokit: Octokit, pullRequest: PullRequest): Promise<void> {
    const assignees = pullRequest.assignees || [];

    // Assign pull request with PR creator
    await octokit.rest.issues.update({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: pullRequest.number,
        assignees: [pullRequest.user?.login].concat(assignees.map((u: Assignee) => u?.login)),
    });
    core.info('Creator successfully assigned');
}

/**
 * If milestone is not set then sets it to a current milestone of a given team.
 */
export async function fillCurrentMilestone(context: Context, octokit: Octokit, pullRequest: PullRequest, teamName: string): Promise<void> {
    // Assign PR to right sprint milestone
    const { data: milestones } = await octokit.request('GET /repos/{owner}/{repo}/milestones', {
        owner: context.repo.owner,
        repo: context.repo.repo,
    });
    if (milestones.length === 0) throw new Error('No sprint milestone!');

    const foundMilestone = findMilestone(milestones, teamName);
    if (!foundMilestone) throw new Error('Cannot find current sprint milestone!');

    await octokit.rest.issues.update({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: pullRequest.number,
        milestone: foundMilestone.number,
    });
    core.info(`Milestone successfully filled with ${foundMilestone.title}`);
}
