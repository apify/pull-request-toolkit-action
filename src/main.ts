import * as core from '@actions/core';
import * as github from '@actions/github';

async function assignPrCreator(octokit: any, pullRequest: any): Promise<void> {
    // Assign pull request with PR creator
    await octokit.issues.update({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: pullRequest.number,
        assignees: [pullRequest.user.login].concat(pullRequest.assignees.map((u: any) => u.login)),
    });
    console.log('Creator successfully assigned');
}

export function findMilestone(milestones: any, teamName: string) {
    const now = new Date();
    // All open milestones
    // @ts-ignore
    const openMilestones = milestones.filter((milestone) => {
        return milestone.state === 'open'
            && milestone.due_on && new Date(milestone.due_on) >= now;
    });

    // Find milestone for the team, if team name was provided
    let foundMilestone;
    if (teamName) {
        const teamNameRegExp = new RegExp(teamName, 'i');
        // @ts-ignore
        foundMilestone = openMilestones.find(({ description, title }) => {
            return title.match(teamNameRegExp)
                || description.match(teamNameRegExp);
        });
    } else if (openMilestones.length) {
        ([foundMilestone] = openMilestones);
    }
    return foundMilestone;
}

async function fillCurrentMilestone(octokit: any, pullRequest: any, teamName: string): Promise<void> {
    // Assign PR to right sprint milestone
    const { data: milestones } = await octokit.request('GET /repos/{owner}/{repo}/milestones', {
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
    });

    if (milestones.length === 0) {
        core.setFailed('No sprint milestone!');
        return;
    }

    const foundMilestone = findMilestone(milestones, teamName);

    if (!foundMilestone) {
        core.setFailed('Cannot find current sprint milestone!');
        return;
    }

    await octokit.issues.update({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: pullRequest.number,
        milestone: foundMilestone.number,
    });
    console.log(`Milestone successfully filled with ${foundMilestone.title}`);
}

async function run(): Promise<void> {
    try {
        const repoToken = core.getInput('repo-token');
        const teamMembers = core.getInput('team-members');
        const teamName = core.getInput('team-members');
        const octokit = github.getOctokit(repoToken);

        const teamMemberList = teamMembers ? teamMembers.split(',').map((member: string) => member.trim()) : [];
        const pullRequest = github.context.payload.pull_request;
        if (!pullRequest) {
            core.setFailed('Action works only for PRs');
            return;
        }

        if (pullRequest.user.login && teamMemberList.length && !teamMemberList.includes(pullRequest.user.login)) {
            console.log(`User ${pullRequest.user.login} is not a member of team. Skipping toolkit action.`);
            return;
        }

        const isCreatorAssign = pullRequest.assignees.find((u: any) => u.login === pullRequest.user.login);
        // Assign PR to creator of PR
        if (!isCreatorAssign) await assignPrCreator(octokit, pullRequest);
        // Fill milestone if there is any yet.
        if (!pullRequest.milestone) await fillCurrentMilestone(octokit, pullRequest, teamName);
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
