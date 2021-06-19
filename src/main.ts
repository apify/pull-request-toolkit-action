import { components } from '@octokit/openapi-types/dist-types/generated/types.d';
import * as core from '@actions/core';
import * as github from '@actions/github';
import {
    assignPrCreator,
    fillCurrentMilestone,
    findUsersTeamName,
} from './helpers';

type Assignee = components['schemas']['simple-user'];

async function run(): Promise<void> {
    try {
        const repoToken = core.getInput('repo-token');
        const orgToken = core.getInput('org-token');
        const repoOctokit = github.getOctokit(repoToken);
        const orgOctokit = github.getOctokit(orgToken);

        const pullRequestContext = github.context.payload.pull_request;
        if (!pullRequestContext) throw new Error('Action works only for PRs!');

        console.log(pullRequestContext.base.repo.name);
        const { data: pullRequest } = await repoOctokit.pulls.get({
            owner: pullRequestContext.owner,
            repo: pullRequestContext.base.repo.name,
            pull_number: pullRequestContext.number,
        });
        console.log('xxxxx');

        const teamName = await findUsersTeamName(orgOctokit, pullRequestContext.user.login);
        if (!teamName) {
            console.log(`User ${pullRequestContext.user.login} is not a member of team. Skipping toolkit action.`);
            return;
        }

        const isCreatorAssigned = pullRequestContext.assignees.find((u: Assignee) => u?.login === pullRequestContext.user.login);
        if (!isCreatorAssigned) await assignPrCreator(github.context, repoOctokit, pullRequest);

        if (!pullRequestContext.milestone) await fillCurrentMilestone(github.context, repoOctokit, pullRequest, teamName);
    } catch (error) {
        console.log(error);
        core.setFailed(error.message);
    }
}

run();
