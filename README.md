# opencode-aws-bedrock-auth

[![npm](https://img.shields.io/npm/v/opencode-aws-bedrock-auth)](https://www.npmjs.com/package/opencode-aws-bedrock-auth)

An [OpenCode](https://opencode.ai) plugin that automatically refreshes your AWS Bedrock SSO session before it expires — so your AI sessions are never interrupted by auth errors.

## How it works

- On startup, reads your `amazon-bedrock` provider profile from `opencode.json`
- Validates the current SSO session via `aws sts get-caller-identity`
- If the session is expired, runs `aws sso login --profile <profile>` automatically
- Re-checks every 20 minutes, throttled and deduplicated to avoid concurrent refresh races
- Guards `shell` and `subagent` tool calls so they never run against an expired session
- Exposes an `aws_refresh_token` tool for on-demand manual refresh

## Installation

Add the package name to the `plugins` array in your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-aws-bedrock-auth"]
}
```

OpenCode will install and load it automatically at startup. No file copying required.

## Configuration

Ensure you have an `amazon-bedrock` provider with a `profile` in your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-aws-bedrock-auth"],
  "providers": {
    "amazon-bedrock": {
      "settings": {
        "profile": "my-sso-profile"
      }
    }
  }
}
```

If no profile is configured, the plugin stays inactive and logs a warning.

## Manual refresh

The plugin registers an `aws_refresh_token` tool that bypasses the 20-minute interval and forces an immediate session check. Ask the AI to run it whenever you want to refresh proactively:

> "Please refresh my AWS token"
> "Run aws_refresh_token"

This is useful before kicking off a long operation, or after receiving an authentication error.

## Requirements

- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) installed and on `PATH`
- An AWS SSO profile configured via `aws configure sso`
- [OpenCode](https://opencode.ai) 2.x (for OpenCode 1, use `opencode-aws-bedrock-auth@0.2.0`)

## Development

```sh
npm install
npm run build      # compile to dist/
npm run typecheck  # type-check only
npm run lint       # oxlint
npm run fmt        # oxfmt (writes)
npm run fmt:check  # oxfmt (CI check, no writes)
```

## Releasing

Releases are published to npm from GitHub with [trusted publishing](https://docs.npmjs.com/trusted-publishers)
(no npm token). The workflow is `.github/workflows/release.yml`.

```sh
npm version patch|minor|major -m "chore(release): %s"   # bumps package.json, commits, tags vX.Y.Z
git push --follow-tags
gh release create vX.Y.Z --generate-notes
```

Publishing the GitHub Release triggers the workflow, which checks that the tag matches `package.json`, runs lint,
format check, typecheck and build, then runs `npm publish`. Mark the release as a pre-release to publish it under the
`next` dist-tag instead of `latest`.

One-time setup: register the workflow as a trusted publisher for the package.

```sh
npm trust github opencode-aws-bedrock-auth --repo favasconcelos/opencode-aws-bedrock-auth --file release.yml
```

## License

MIT
