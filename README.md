# Pull request toolkit

This action automates a couple of processes connected with the management of GitHub pull requests.

# What it does

- Assigns PR to its creator.
- Fills a missing milestone with a current milestone from Zenhub.
- Assigns a team label (`t-[teamName]`) to the pull request.
- Makes sure that:
  - PR is either linked with epic or issue or labeled as `adhoc`
  - PR itself or linked issue is estimated

## Wishlist / TODOs

- GitHub action for publishing of a new version.
- GitHub action for lint and tests execution.
- Use Docker image with runtime typescript compilation instead of committing a dist directory.

# Action input

| Name           | Description                                        | Example        | Required |
|----------------|----------------------------------------------------|----------------|----------|
| `repo-token`   | Repository GitHub token                            | `github-token` | yes      |
| `org-token`    | GitHub token with read only access to organization | `github-token` | yes      |
| `zenhub-token` | GitHub token with read only access to organization | `zenhub-token` | yes      |

# Example usage

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

# Contribution

1. Update code in `./src`
2. Run `npm i`
3. Run `npm run all`
4. Commit all changes including `./dist` folder with built code.
5. Publish a new version of an action using the new release (It needs to be done manually)
