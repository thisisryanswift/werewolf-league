// Bindings for the Worker and its Durable Objects. Kept by hand (instead of
// `wrangler types`) so it composes with @cloudflare/workers-types.
declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("./src/worker/index");
  }
  interface Env {
    LEAGUE: DurableObjectNamespace<import("./src/do/league").LeagueDO>;
    MATCH: DurableObjectNamespace<import("./src/do/match").MatchDO>;
    PLAYER: DurableObjectNamespace<import("./src/do/player").PlayerDO>;
    PI_SEAT: DurableObjectNamespace<import("./src/harness/pi/seat").PiSeatDO>;
    ASSETS: Fetcher;
    /** Shared secret for admin endpoints (`x-admin-secret` header). Secret; never in wrangler.jsonc. */
    ADMIN_SECRET?: string;
    /** Player DO Harness poll interval in milliseconds. */
    PLAYER_POLL_MS: string;
    /** Retry interval in milliseconds for League Match starts and Match result delivery. */
    LEAGUE_RETRY_MS: string;
    /** Gemini API key for the managed-agent harness. Secret: .dev.vars / Wrangler secret only. */
    GEMINI_API_KEY?: string;
    /** OpenRouter key for pi seats' models. Secret: .dev.vars / Wrangler secret only. */
    OPENROUTER_API_KEY?: string;
    /** Agent37 key for pi seats' sandboxes. Secret: .dev.vars / Wrangler secret only. */
    AGENT37_API_KEY?: string;
  }
}
type Env = Cloudflare.Env;

/** Markdown files bundled as text (wrangler.jsonc "rules"), e.g. the Agent Instructions. */
declare module "*.md" {
  const text: string;
  export default text;
}
