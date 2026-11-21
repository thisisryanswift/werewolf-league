import { handleApi } from "./routes";

export { LeagueDO } from "../do/league";
export { MatchDO } from "../do/match";
export { PlayerDO } from "../do/player";
export { PiSeatDO } from "../harness/pi/seat";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
