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

async function fillCurrentMilestone(octokit: any, pullRequest: any): Promise<void> {
    // Assign PR to right sprint milestone
    const { data: milestones } = await octokit.request('GET /repos/{owner}/{repo}/milestones', {
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
    });

    if (milestones.length === 0) {
        core.setFailed('No sprint milestone!');
        return;
    }

    const now = new Date();
    // @ts-ignore
    const openMilestone = milestones.find((milestone) => {
        return milestone.state === 'open'
            && milestone.due_on && new Date(milestone.due_on) >= now;
    });

    if (!openMilestone) {
        core.setFailed('Cannot find current sprint milestone!');
        return;
    }

    await octokit.issues.update({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: pullRequest.number,
        milestone: openMilestone.number,
    });
    console.log(`Milestone successfully filled with ${openMilestone.title}`);
}

async function run(): Promise<void> {
    try {
        const repoToken = core.getInput('repo-token');
        const octokit = github.getOctokit(repoToken);

        const pullRequest = github.context.payload.pull_request;
        if (!pullRequest) {
            core.setFailed('Action works only for PRs');
            return;
        }

        const isCreatorAssign = pullRequest.assignees.find((u: any) => u.login === pullRequest.user.login);
        // Assign PR to creator of PR
        if (!isCreatorAssign) await assignPrCreator(octokit, pullRequest);
        // Fill milestone if there is any yet.
        if (!pullRequest.milestone) await fillCurrentMilestone(octokit, pullRequest);
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
