# Pull request toolkit

This action makes PR better for Zenhub integration.

# What it does

- Assign PR to the creator of PR
- Fill missing milestone with a current milestone for the repository

# Action input

| Name               |                                                                    Description           |                                                     Example | Required |
| ------------------ | --------------------------------------------------------------------------------         | ----------------------------------------------------------- | -------- |
| `repo-token`       |                                                           Repository Github token        |                                              `github-token` |      yes |
| `team-members`     | List of Github usernames for members using toolkit (by default everybody included)       |                                       `username1,username2` |       no |
| `team-name`        | If name is provide, the milestone will be filter by regexp base on team name.            |                                                  `platform` |       no |

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

      - name: run PR toolkit
        uses: ./.github/actions/pull-request-toolkit-action
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          team-members: mtrunkat,gippy,drobnikj,fnesveda,mhamas,valekjo,Strajk,nguyeda1,dragonraid,jbartadev,m-murasovs
```
# TBD

- Tests
- Github action for publishing new version

## Contribution

1. Update code in `./src`
2. Run `npm i`
3. Run `npm run all`
4. Commit all changes including `./disc` folder with built code.
5. Publish a new version of action using new release (It needs to be done manually)
