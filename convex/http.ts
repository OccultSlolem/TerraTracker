import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const accessControlHeaders = httpAction(async () => {
  // TODO: Restrict this to only the domains that need it
  const response = new Response(JSON.stringify({ message: "OK" }), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-challenge",
    },
  });
  return response;
});

const testWebhook = httpAction(async (_, request) => {
  console.log(await request.json());
  return new Response();
});

const http = httpRouter();

http.route({
  path: "/my-webhook",
  method: 'POST',
  handler: testWebhook
});

http.route({
  path: "/my-webhook",
  method: 'OPTIONS',
  handler: accessControlHeaders
});

export default http;
