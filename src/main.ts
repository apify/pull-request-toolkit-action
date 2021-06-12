import { components } from '@octokit/openapi-types/dist-types/generated/types.d';
import * as core from '@actions/core';
import * as github from '@actions/github';
import {
    assignPrCreator,
    fillCurrentMilestone,
} from './helpers';

type Assignee = components['schemas']['simple-user'];

async function run(): Promise<void> {
    try {
        const repoToken = core.getInput('repo-token');
        const teamMembers = core.getInput('team-members');
        const teamName = core.getInput('team-name');
        const octokit = github.getOctokit(repoToken);

        const teamMemberList = teamMembers ? teamMembers.split(',').map((member: string) => member.trim()) : [];
        const pullRequestContext = github.context.payload.pull_request;
        if (!pullRequestContext) {
            core.setFailed('Action works only for PRs');
            return;
        }

        console.log(typeof process.env.APIFY_SERVICE_ACCOUNT_GITHUB_TOKEN);
        console.log(pullRequestContext);

        const childTeams = await octokit.teams.listChildInOrg({
            org: 'apify',
            team_slug: 'platform-team',
        });
        console.log(childTeams);

        const pullRequest = await octokit.rest.pulls.get({
            owner: pullRequestContext.owner,
            repo: pullRequestContext.repo,
            pull_number: pullRequestContext.number,
        });

        if (pullRequestContext.user.login && teamMemberList.length && !teamMemberList.includes(pullRequestContext.user.login)) {
            console.log(`User ${pullRequestContext.user.login} is not a member of team. Skipping toolkit action.`);
            return;
        }

        const isCreatorAssign = pullRequestContext.assignees.find((u: Assignee) => u?.login === pullRequestContext.user.login);
        if (!isCreatorAssign) await assignPrCreator(github.context, octokit, pullRequest);

        if (!pullRequestContext.milestone) await fillCurrentMilestone(github.context, octokit, pullRequest, teamName);
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
