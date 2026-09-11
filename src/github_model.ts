import type { Octokit, FieldValue, IssueOrPullRequestSpec } from './types.ts';

/**
 * A wrapper around Octokit for interacting with the GitHub API using semantic methods.
 * Intentionally does not contain any business logic to separate concerns.
 */
export class GitHubModel {
    private octokit: Octokit;

    constructor(octokit: Octokit) {
        this.octokit = octokit;
    }

    /**
     * Fetches the repository.
     */
    public async getRepo(owner: string, repo: string) {
        const { data: repository } = await this.octokit.rest.repos.get({
            owner,
            repo,
        });
        return repository;
    }

    /**
     * Fetches all label names defined on the repository.
     */
    public async getLabelsForRepo(repoOwner: string, repoName: string): Promise<string[]> {
        const labels = await this.octokit.paginate(this.octokit.rest.issues.listLabelsForRepo, {
            owner: repoOwner,
            repo: repoName,
            per_page: 100,
        });
        return labels.map((label) => label.name);
    }

    /**
     * Fetches the child teams of the given team in an organization.
     */
    public async getChildTeams(org: string, parentTeamSlug: string) {
        return await this.octokit.paginate(this.octokit.rest.teams.listChildInOrg, {
            org,
            team_slug: parentTeamSlug,
            per_page: 100,
        });
    }

    /**
     * Fetches the members of the given team in an organization.
     */
    public async getTeamMembers(org: string, teamSlug: string) {
        return await this.octokit.paginate(this.octokit.rest.teams.listMembersInOrg, {
            org,
            team_slug: teamSlug,
            per_page: 100,
        });
    }

    /**
     * Fetches a pull request.
     */
    public async getPullRequest(owner: string, repo: string, number: number) {
        const { data: pullRequest } = await this.octokit.rest.pulls.get({
            owner,
            repo,
            pull_number: number,
        });
        return pullRequest;
    }

    /**
     * Fetches the list of files changed in a pull request.
     */
    public async getPullRequestFiles(owner: string, repo: string, number: number) {
        return await this.octokit.paginate(this.octokit.rest.pulls.listFiles, {
            owner,
            repo,
            pull_number: number,
            per_page: 100,
        });
    }

    /**
     * Fetches the issues that GitHub natively recognizes as being closed by the pull request.
     */
    public async getNativelyLinkedIssuesForPullRequest(
        owner: string,
        repo: string,
        number: number,
    ): Promise<IssueOrPullRequestSpec[]> {
        const response = await this.octokit.graphql<{
            repository: {
                pullRequest: {
                    closingIssuesReferences: {
                        nodes: ({
                            id: string;
                            number: number;
                            repository: { owner: { login: string }; name: string };
                        } | null)[];
                    };
                };
            };
        }>(
            `query getClosingIssues($owner: String!, $repo: String!, $number: Int!) {
                repository(owner: $owner, name: $repo) {
                    pullRequest(number: $number) {
                        closingIssuesReferences(first: 25) {
                            nodes {
                                id
                                number
                                repository {
                                    owner {
                                        login
                                    }
                                    name
                                }
                            }
                        }
                    }
                }
            }`,
            {
                owner,
                repo,
                number,
            },
        );
        return response.repository.pullRequest.closingIssuesReferences.nodes
            .filter((node) => node !== null)
            .map((node) => ({ owner: node.repository.owner.login, repo: node.repository.name, number: node.number }));
    }

    /**
     * Fetches the parent issue of the given issue, if any.
     */
    public async getParentIssue(owner: string, repo: string, number: number) {
        try {
            const response = await this.octokit.rest.issues.getParent({
                owner,
                repo,
                issue_number: number,
            });
            if (!response.data) return null;
            return {
                owner: response.data.repository!.owner.login,
                repo: response.data.repository!.name,
                number: response.data.number,
            };
        } catch (error) {
            // GitHub returns 404 when the issue has no parent.
            if (error && typeof error === 'object' && 'status' in error && error.status === 404) return null;
            throw error;
        }
    }

    /**
     * Fetches all projects in an organization.
     */
    public async listProjects(org: string) {
        return await this.octokit.paginate(this.octokit.rest.projects.listForOrg, { org });
    }

    /**
     * Fetches the project items an issue belongs to.
     */
    public async getProjectItemsForIssue(owner: string, repo: string, number: number) {
        const response = await this.octokit.graphql<{
            repository: {
                // The issue is null when the referenced number does not exist or points at a pull request.
                issue: {
                    projectItems: {
                        nodes: {
                            id: string;
                            project: {
                                id: string;
                                number: number;
                            };
                        }[];
                    };
                } | null;
            } | null;
        }>(
            `query getProjectItems($owner: String!, $repo: String!, $number: Int!) {
                repository(owner: $owner, name: $repo) {
                    issue(number: $number) {
                        projectItems(first: 10) {
                            nodes {
                                id
                                project {
                                    id
                                    number
                                }
                            }
                        }
                    }
                }
            }`,
            { owner, repo, number },
        );
        return response.repository?.issue?.projectItems?.nodes ?? [];
    }

    /**
     * Fetches the project items a pull request belongs to.
     */
    public async getProjectItemsForPullRequest(owner: string, repo: string, number: number) {
        const response = await this.octokit.graphql<{
            repository: {
                pullRequest: {
                    projectItems: {
                        nodes: {
                            id: string;
                            project: {
                                id: string;
                                number: number;
                            };
                        }[];
                    };
                } | null;
            } | null;
        }>(
            `query getProjectItems($owner: String!, $repo: String!, $number: Int!) {
                repository(owner: $owner, name: $repo) {
                    pullRequest(number: $number) {
                        projectItems(first: 10) {
                            nodes {
                                id
                                project {
                                    id
                                    number
                                }
                            }
                        }
                    }
                }
            }`,
            { owner, repo, number },
        );
        return response.repository?.pullRequest?.projectItems?.nodes ?? [];
    }
    /**
     * Fetches the fields defined on a project.
     */
    public async getProjectFields(owner: string, projectNumber: number) {
        const { data: fields } = await this.octokit.rest.projects.listFieldsForOrg({
            org: owner,
            project_number: projectNumber,
            per_page: 100,
        });
        return fields;
    }

    /**
     * Fetches the field values set on a project item, keyed by field name.
     */
    public async getProjectItemFieldValues(projectItemId: string): Promise<{ [fieldName: string]: FieldValue }> {
        const fieldsResponse = await this.octokit.graphql<any>(
            `query getItemFields($itemId: ID!) {
                node(id: $itemId) {
                    ... on ProjectV2Item {
                        id
                        fieldValues(first: 100) {
                            nodes {
                                ... on ProjectV2ItemFieldDateValue {
                                    field {
                                        ... on ProjectV2FieldCommon {
                                            id
                                            name
                                            dataType
                                        }
                                    }
                                    date
                                }
                                ... on ProjectV2ItemFieldIterationValue {
                                    field {
                                        ... on ProjectV2FieldCommon {
                                            id
                                            name
                                            dataType
                                        }
                                    }
                                    iterationId
                                    title
                                    startDate
                                    duration
                                }
                                ... on ProjectV2ItemFieldMultiSelectValue {
                                    field {
                                        ... on ProjectV2FieldCommon {
                                            id
                                            name
                                            dataType
                                        }
                                    }
                                    options {
                                        id
                                        name
                                    }
                                }
                                ... on ProjectV2ItemFieldNumberValue {
                                    field {
                                        ... on ProjectV2FieldCommon {
                                            id
                                            name
                                            dataType
                                        }
                                    }
                                    number
                                }
                                ... on ProjectV2ItemFieldSingleSelectValue {
                                    field {
                                        ... on ProjectV2FieldCommon {
                                            id
                                            name
                                            dataType
                                        }
                                    }
                                    name
                                    optionId
                                }
                                ... on ProjectV2ItemFieldTextValue {
                                    field {
                                        ... on ProjectV2FieldCommon {
                                            id
                                            name
                                            dataType
                                        }
                                    }
                                    text
                                }
                            }
                        }
                    }
                }
            }`,
            { itemId: projectItemId },
        );

        return Object.fromEntries(
            (fieldsResponse.node?.fieldValues?.nodes ?? [])
                .filter(
                    (node: any) => typeof node === 'object' && node !== null && 'field' in node && node.field !== null,
                )
                .map((node: any) => {
                    let value;
                    switch (node.field.dataType) {
                        case 'DATE':
                            value = node.date;
                            break;
                        case 'ITERATION':
                            value = {
                                iterationId: node.iterationId,
                                title: node.title,
                                startDate: node.startDate,
                                duration: node.duration,
                            };
                            break;
                        case 'MULTI_SELECT':
                            value = node.options.map((option: any) => ({ id: option.id, name: option.name }));
                            break;
                        case 'NUMBER':
                            value = node.number;
                            break;
                        case 'SINGLE_SELECT':
                            value = { name: node.name, optionId: node.optionId };
                            break;
                        case 'TEXT':
                            value = node.text;
                            break;
                        default:
                            value = null;
                    }
                    return [node.field.name, { id: node.field.id, dataType: node.field.dataType, value }];
                })
                .filter(([, value]: [string, { id: string; dataType: string; value: any }]) => value.value !== null),
        );
    }

    /**
     * Sets the assignees on an issue or pull request, overwriting any existing ones.
     */
    public async assignUsersToIssue(
        owner: string,
        repo: string,
        issueNumber: number,
        userLogins: string[],
    ): Promise<void> {
        await this.octokit.rest.issues.update({
            owner,
            repo,
            issue_number: issueNumber,
            assignees: userLogins,
        });
    }

    /**
     * Adds a label to an issue or pull request.
     */
    public async addLabelToIssueOrPullRequest(
        owner: string,
        repo: string,
        number: number,
        labelName: string,
    ): Promise<void> {
        await this.octokit.rest.issues.addLabels({
            owner,
            repo,
            issue_number: number,
            labels: [labelName],
        });
    }

    /**
     * Sets a iteration field of a project item to the given iteration.
     */
    public async setProjectItemIterationFieldValue(
        projectNodeId: string,
        itemId: string,
        iterationFieldId: string,
        iterationId: string,
    ) {
        await this.octokit.graphql(
            `mutation setIteration($projectId: ID!, $itemId: ID!, $iterationFieldId: ID!, $iterationId: String!) {
                updateProjectV2ItemFieldValue(input: {
                    projectId: $projectId,
                    itemId: $itemId,
                    fieldId: $iterationFieldId,
                    value: { iterationId: $iterationId }
                }) {
                    projectV2Item {
                        id
                    }
                }
            }`,
            { projectId: projectNodeId, itemId, iterationFieldId, iterationId },
        );
    }

    /**
     * Sets a single select field of a project item to the given option.
     */
    public async setProjectItemSingleSelectFieldValue(
        projectNodeId: string,
        itemId: string,
        singleSelectFieldId: string,
        optionId: string,
    ) {
        await this.octokit.graphql(
            `mutation setSingleSelect($projectId: ID!, $itemId: ID!, $singleSelectFieldId: ID!, $optionId: String!) {
                updateProjectV2ItemFieldValue(input: {
                    projectId: $projectId,
                    itemId: $itemId,
                    fieldId: $singleSelectFieldId,
                    value: { singleSelectOptionId: $optionId }
                }) {
                    projectV2Item {
                        id
                    }
                }
            }`,
            { projectId: projectNodeId, itemId, singleSelectFieldId, optionId },
        );
    }

    /**
     * Adds a pull request to a project.
     */
    public async addPullRequestToProject(projectNodeId: string, pullRequestNodeId: string) {
        const response = await this.octokit.graphql<{
            addProjectV2ItemById: { item: { id: string; fullDatabaseId: number } };
        }>(
            `mutation addToProject($projectId: ID!, $contentId: ID!) {
                addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
                    item {
                        id
                        fullDatabaseId
                    }
                }
            }`,
            { projectId: projectNodeId, contentId: pullRequestNodeId },
        );
        return response.addProjectV2ItemById.item;
    }
}
