import type { Plugin, PluginInput, Config } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';

const CHECK_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
const AWS_TOOLS = new Set(['bash', 'task']);
const LOG_PREFIX = '[opencode-aws-bedrock-auth]';
const DEFAULT_PROFILE = 'default';
const INITIAL_CHECKED_AT = 0;

type Shell = PluginInput['$'];

type BedrockConfig = {
  provider?: {
    'amazon-bedrock'?: {
      options?: {
        profile?: string;
      };
    };
  };
};

async function isSessionValid($: Shell, profile: string): Promise<boolean> {
  try {
    // .quiet() suppresses stdout/stderr bleed into the opencode terminal
    await $`aws sts get-caller-identity --profile ${profile}`.quiet();
    return true;
  } catch {
    return false;
  }
}

async function refreshSession($: Shell, profile: string): Promise<void> {
  console.log(`${LOG_PREFIX} SSO session expired — running: aws sso login --profile ${profile}`);
  // Intentionally no .quiet() — browser open + confirmation output is useful to see
  await $`aws sso login --profile ${profile}`;
  console.log(`${LOG_PREFIX} SSO session refreshed for profile: ${profile}`);
}

export default (async ({ $ }) => {
  // Closure-scoped state — safe from module-level mutation races
  let profile = DEFAULT_PROFILE;
  let lastCheckedAt = INITIAL_CHECKED_AT;
  let refreshInFlight: Promise<void> | null = null;

  async function checkAndRefresh(): Promise<void> {
    const now = Date.now();
    if (now - lastCheckedAt < CHECK_INTERVAL_MS) {
      return;
    }

    // If a refresh is already in-flight, wait for it instead of launching another
    if (refreshInFlight) {
      return refreshInFlight;
    }

    refreshInFlight = (async () => {
      try {
        const valid = await isSessionValid($, profile);
        if (!valid) {
          await refreshSession($, profile);
        }
        lastCheckedAt = Date.now(); // stamp only after success
      } finally {
        refreshInFlight = null;
      }
    })();

    return refreshInFlight;
  }

  return {
    tool: {
      aws_refresh_token: tool({
        description:
          'Manually refresh the AWS SSO session for the configured Bedrock profile. Use this if you receive authentication errors or want to ensure the session is valid before a long operation.',
        args: {},
        async execute() {
          lastCheckedAt = INITIAL_CHECKED_AT; // invalidate the cache so checkAndRefresh always runs
          await checkAndRefresh();
          return `AWS SSO session refreshed for profile: ${profile}`;
        },
      }),
    },

    async config(cfg: Config & BedrockConfig): Promise<void> {
      const bedrockOptions = cfg.provider?.['amazon-bedrock']?.options;

      if (!bedrockOptions) {
        console.warn(`${LOG_PREFIX} No amazon-bedrock provider found in config — plugin is inactive. Add a provider.amazon-bedrock entry to opencode.json to enable auto-login.`);
        return;
      }

      if (bedrockOptions.profile) {
        profile = bedrockOptions.profile;
        console.log(`${LOG_PREFIX} Using profile: ${profile}`);
      }

      try {
        await checkAndRefresh();
      } catch (err) {
        console.warn(`${LOG_PREFIX} Initial session check failed:`, err);
      }
    },

    async 'tool.execute.before'(input): Promise<void> {
      if (!AWS_TOOLS.has(input.tool)) {
        return;
      }
      await checkAndRefresh();
    },
  };
}) satisfies Plugin;
