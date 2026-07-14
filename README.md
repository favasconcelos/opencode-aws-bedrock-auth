# opencode-aws-bedrock-auth

An [OpenCode](https://opencode.ai) plugin that automatically refreshes your AWS Bedrock SSO session before it expires — so your AI sessions are never interrupted by auth errors.

## How it works

- On startup, reads your `amazon-bedrock` provider profile from `opencode.json`
- Validates the current SSO session via `aws sts get-caller-identity`
- If the session is expired, runs `aws sso login --profile <profile>` automatically
- Re-checks every 20 minutes, throttled and deduplicated to avoid concurrent refresh races
- Guards `bash` and `task` tool calls so they never run against an expired session

## Installation

Copy `dist/index.js` to your OpenCode global plugin directory:

```sh
cp dist/index.js ~/.config/opencode/plugin/aws-bedrock-auth.js
```

Or point OpenCode at the built file directly in your `opencode.json`.

## Configuration

In your `opencode.json`, ensure you have an `amazon-bedrock` provider with a `profile`:

```json
{
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
- [OpenCode](https://opencode.ai) with the `@opencode-ai/plugin` SDK

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
