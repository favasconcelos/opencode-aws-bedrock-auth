# opencode-aws-bedrock-auth

[![npm](https://img.shields.io/npm/v/opencode-aws-bedrock-auth)](https://www.npmjs.com/package/opencode-aws-bedrock-auth)

An [OpenCode](https://opencode.ai) plugin that automatically refreshes your AWS Bedrock SSO session before it expires — so your AI sessions are never interrupted by auth errors.

## How it works

- On startup, reads your `amazon-bedrock` provider profile from `opencode.json`
- Validates the current SSO session via `aws sts get-caller-identity`
- If the session is expired, runs `aws sso login --profile <profile>` automatically
- Re-checks every 20 minutes, throttled and deduplicated to avoid concurrent refresh races
- Guards `bash` and `task` tool calls so they never run against an expired session

## Installation

Add the package name to the `plugin` array in your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-aws-bedrock-auth"]
}
```

OpenCode will install and load it automatically at startup. No file copying required.

## Configuration

Ensure you have an `amazon-bedrock` provider with a `profile` in your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-aws-bedrock-auth"],
  "provider": {
    "amazon-bedrock": {
      "options": {
        "profile": "my-sso-profile"
      }
    }
  }
}
```

If no profile is configured, the plugin falls back to `default` and logs a warning.

## Requirements

- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) installed and on `PATH`
- An AWS SSO profile configured via `aws configure sso`
- [OpenCode](https://opencode.ai) v0.1.x or later

## Development

```sh
npm install
npm run build      # compile to dist/
npm run typecheck  # type-check only
npm run lint       # oxlint
npm run fmt        # oxfmt (writes)
npm run fmt:check  # oxfmt (CI check, no writes)
```

## License

MIT
