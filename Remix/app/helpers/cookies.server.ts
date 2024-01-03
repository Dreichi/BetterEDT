import { createCookie } from "@remix-run/node"; // or cloudflare/deno

export const cookies = createCookie("userChoice", {
  maxAge: 604_800, // one week
});

const supabaseToken = createCookie("sb:token", {
  ...cookies,
});

export default supabaseToken;
