# Pull request toolkit

This action automates a couple of processes connected with the management of GitHub pull requests.

## What it does

- Assigns PR to its creator.
- Fills a missing milestone with a current milestone from Zenhub.
- Assigns a team label (`t-[teamName]`) to the pull request.
- Makes sure that:
  - PR is either linked with epic or issue or labeled as `adhoc`
  - PR itself or linked issue is estimated

## Action input

| Name           | Description                                        | Example        | Required |
|----------------|----------------------------------------------------|----------------|----------|
| `repo-token`   | Repository GitHub token                            | `github-token` | yes      |
| `org-token`    | GitHub token with read only access to organization | `github-token` | yes      |
| `zenhub-token` | ZenHub API token with access to Apify workspace    | `zenhub-token` | yes      |

## Example usage

```yaml
name: Apify PR toolkit

on:
  pull_request:
    branches:
      - develop

jobs:
  apify-pr-toolkit:
    runs-on: ubuntu-20.04
    steps:
      - name: clone pull-request-toolkit-action
        uses: actions/checkout@v2
        with:
          repository: apify/pull-request-toolkit-action
          ref: refs/tags/v1.0.1
          path: ./.github/actions/pull-request-toolkit-action

      - name: run pull-request-toolkit action
        uses: ./.github/actions/pull-request-toolkit-action
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          org-token: ${{ secrets.PULL_REQUEST_TOOLKIT_ACTION_GITHUB_TOKEN }}
          zenhub-token: ${{ secrets.PULL_REQUEST_TOOLKIT_ACTION_ZENHUB_TOKEN }}
```

## How to release new version

1. Create a PR. **IMPORTANT: Avoid using the `chore:` prefix, as it doesn't work with RELEASE-PLEASE. Use `feat:` or `fix:` instead.**
2. Merge PR into the main branch after approval. This triggers an automated workflow that generates a new PR for the release using the RELEASE-PLEASE action.
3. Navigate to the PR and merge it into the main branch. This will publish the release with an updated changelog.
