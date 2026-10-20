import { execFile, spawn } from 'node:child_process';
import type { Plugin } from '@opencode/plugin';

const CHECK_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
const AWS_TOOLS = new Set(['shell', 'subagent']);
const LOG_PREFIX = '[opencode-aws-bedrock-auth]';
const INITIAL_CHECKED_AT = 0;

function forward(chunk: Buffer): void {
  const text = chunk.toString().trimEnd();
  if (text) {
    console.log(text);
  }
}

function isSessionValid(profile: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('aws', ['sts', 'get-caller-identity', '--profile', profile], (err) => resolve(!err));
  });
}

function refreshSession(profile: string): Promise<void> {
  console.log(`${LOG_PREFIX} SSO session expired — running: aws sso login --profile ${profile}`);
  // Output is forwarded rather than ignored — browser open + confirmation output is useful to see
  return new Promise((resolve, reject) => {
    const child = spawn('aws', ['sso', 'login', '--profile', profile], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`${LOG_PREFIX} SSO session refreshed for profile: ${profile}`);
        resolve();
      } else {
        reject(new Error(`aws sso login exited with code ${code}`));
      }
    });
  });
}

const plugin: Plugin.Plugin = {
  id: 'opencode-aws-bedrock-auth',
  async setup(ctx) {
    // Closure-scoped state — safe from module-level mutation races
    let profile: string | undefined;
    let lastCheckedAt = INITIAL_CHECKED_AT;
    let refreshInFlight: Promise<void> | null = null;
    let warnedInactive = false;

    async function checkAndRefresh(): Promise<void> {
      const activeProfile = profile;
      if (activeProfile === undefined) {
        return;
      }

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
          const valid = await isSessionValid(activeProfile);
          if (!valid) {
            await refreshSession(activeProfile);
          }
          lastCheckedAt = Date.now(); // stamp only after success
        } finally {
          refreshInFlight = null;
        }
      })();

      return refreshInFlight;
    }

    // Built-in provider settings always exist (e.g. `region`), so only an explicit `profile` activates the plugin.
    async function syncProfile(): Promise<void> {
      let next: string | undefined;
      try {
        const { data } = await ctx.provider.get({ providerID: 'amazon-bedrock' });
        const configured = data.settings?.['profile'];
        next = typeof configured === 'string' && configured ? configured : undefined;
      } catch {
        next = undefined;
      }

      if (next === undefined) {
        if (!warnedInactive) {
          warnedInactive = true;
          console.warn(`${LOG_PREFIX} No profile found for the amazon-bedrock provider — plugin is inactive. Set providers.amazon-bedrock.settings.profile in opencode.json to enable auto-login.`);
        }
      } else if (next !== profile) {
        console.log(`${LOG_PREFIX} Using profile: ${next}`);
      }
      profile = next;
    }

    // Config is applied to the provider registry after plugin setup, so the profile can appear later.
    // Checking only when it changes avoids re-running a failed login on every provider update.
    async function resolveAndCheck(): Promise<void> {
      const before = profile;
      await syncProfile();
      if (profile !== undefined && profile !== before) {
        await checkAndRefresh();
      }
    }

    await ctx.tool.transform((editor) => {
      editor.add({
        name: 'aws_refresh_token',
        description:
          'Manually refresh the AWS SSO session for the configured Bedrock profile. Use this if you receive authentication errors or want to ensure the session is valid before a long operation.',
        input: { type: 'object', properties: {}, additionalProperties: false },
        async execute() {
          await syncProfile();
          if (profile === undefined) {
            return { content: 'No profile is configured for the amazon-bedrock provider — nothing to refresh.' };
          }
          lastCheckedAt = INITIAL_CHECKED_AT; // invalidate the cache so checkAndRefresh always runs
          await checkAndRefresh();
          return { content: `AWS SSO session refreshed for profile: ${profile}` };
        },
      });
    });

    await ctx.tool.hook('execute.before', async (event) => {
      if (!AWS_TOOLS.has(event.tool)) {
        return;
      }
      await syncProfile();
      await checkAndRefresh();
    });

    // None of this is awaited: `aws sso login` can wait on the browser and must not block startup.
    // Tool calls share the same in-flight promise, so they still wait for the login.
    const controller = new AbortController();
    const warn = (err: unknown) => {
      if (!controller.signal.aborted) {
        console.warn(`${LOG_PREFIX} Session check failed:`, err);
      }
    };

    void resolveAndCheck().catch(warn);
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (event.type === 'provider.updated') {
          await resolveAndCheck().catch(warn);
        }
      }
    })().catch(warn);

    return () => controller.abort();
  },
};

export default plugin;
