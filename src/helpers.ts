import { components } from '@octokit/openapi-types/dist-types/generated/types.d';
import { Octokit } from '@octokit/core/dist-types';
import { Context } from '@actions/github/lib/context.d';

type Milestone = components['schemas']['milestone'];
type Assignee = components['schemas']['simple-user'];
type PullRequest = components['schemas']['pull-request'];

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

export async function assignPrCreator(context: Context, octokit: Octokit, pullRequest: PullRequest): Promise<void> {
    const assignees = pullRequest.assignees || [];

    // Assign pull request with PR creator
    await octokit.issues.update({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: pullRequest.number,
        assignees: [pullRequest.user?.login].concat(assignees.map((u: Assignee) => u?.login)),
    });
    console.log('Creator successfully assigned');
}

export async function fillCurrentMilestone(context: Context, octokit: Octokit, pullRequest: PullRequest, teamName: string): Promise<void> {
    // Assign PR to right sprint milestone
    const { data: milestones } = await octokit.request('GET /repos/{owner}/{repo}/milestones', {
        owner: context.repo.owner,
        repo: context.repo.repo,
    });
    if (milestones.length === 0) throw new Error('No sprint milestone!');

    const foundMilestone = findMilestone(milestones, teamName);
    if (!foundMilestone) throw new Error('Cannot find current sprint milestone!');

    await octokit.issues.update({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: pullRequest.number,
        milestone: foundMilestone.number,
    });
    console.log(`Milestone successfully filled with ${foundMilestone.title}`);
}
