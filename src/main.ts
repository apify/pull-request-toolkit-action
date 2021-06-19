import { components } from '@octokit/openapi-types/dist-types/generated/types.d';
import * as core from '@actions/core';
import * as github from '@actions/github';
import {
    assignPrCreator,
    fillCurrentMilestone,
} from './helpers';

type Assignee = components['schemas']['simple-user'];

const ORGANIZATION = 'apify';
const PARENT_TEAM_SLUG = 'platform-team';

async function run(): Promise<void> {
    try {
        const repoToken = core.getInput('repo-token');
        const orgToken = core.getInput('org-token');
        const teamMembers = core.getInput('team-members');
        const teamName = core.getInput('team-name');
        const repoOctokit = github.getOctokit(repoToken);
        const orgOctokit = github.getOctokit(orgToken);

        console.log('ytyyy');
        console.log('ytyyy');
        console.log('ytyyy');

        const teamMemberList = teamMembers ? teamMembers.split(',').map((member: string) => member.trim()) : [];
        const pullRequestContext = github.context.payload.pull_request;
        if (!pullRequestContext) throw new Error('Action works only for PRs!');

        const { data: childTeams } = await orgOctokit.teams.listChildInOrg({
            org: ORGANIZATION,
            team_slug: PARENT_TEAM_SLUG,
        });
        if (!childTeams.length) throw new Error('No child teams found!');
        for (const { slug } of childTeams) {
            const { data: members } = await orgOctokit.teams.listMembersInOrg({
                org: ORGANIZATION,
                team_slug: slug,
            });
            console.log(members);
        }

        const { data: pullRequest } = await repoOctokit.pulls.get({
            owner: pullRequestContext.owner,
            repo: pullRequestContext.repo,
            pull_number: pullRequestContext.number,
        });

        if (pullRequestContext.user.login && teamMemberList.length && !teamMemberList.includes(pullRequestContext.user.login)) {
            console.log(`User ${pullRequestContext.user.login} is not a member of team. Skipping toolkit action.`);
            return;
        }

        const isCreatorAssign = pullRequestContext.assignees.find((u: Assignee) => u?.login === pullRequestContext.user.login);
        if (!isCreatorAssign) await assignPrCreator(github.context, repoOctokit, pullRequest);

        if (!pullRequestContext.milestone) await fillCurrentMilestone(github.context, repoOctokit, pullRequest, teamName);
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
