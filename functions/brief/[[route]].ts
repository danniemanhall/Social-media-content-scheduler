/** The creator's read-only month brief: see server/brief.ts. */
import { handleBrief, type BriefEnv } from "../../server/brief";
import { GoogleError } from "../../server/google";

export const onRequest: PagesFunction<BriefEnv> = async ({ request, env, params }) => {
  try {
    return await handleBrief(request, env, (params.route as string[] | undefined) ?? []);
  } catch (err) {
    const status = err instanceof GoogleError ? err.status : 500;
    return new Response("Something went wrong loading the brief. Try again in a minute.", { status, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
};
