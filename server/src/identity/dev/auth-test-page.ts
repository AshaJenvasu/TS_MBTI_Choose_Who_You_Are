// Dev-only manual test page for Google sign-in (Ticket 04). Mounted in src/dev.ts only,
// never in createApp, so it cannot reach production. Not the real frontend.
export const AUTH_TEST_PAGE_PATH = "/dev/auth-test";

export const authTestPageHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Auth test (dev only)</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
    button { margin: 0 .5rem .5rem 0; padding: .5rem 1rem; }
    #error { color: #b00020; font-weight: 600; }
    pre { background: #f3f3f3; padding: 1rem; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>Auth test (dev only)</h1>
  <p id="error" hidden></p>
  <button id="sign-in">Sign in with Google</button>
  <button id="session">Get session</button>
  <button id="sign-out">Sign out</button>
  <pre id="out">-</pre>
  <script>
    const ERROR_TEXT = {
      access_denied: "You cancelled Google sign-in. No account was created.",
    };
    const params = new URLSearchParams(location.search);
    const error = params.get("error");
    if (error) {
      const el = document.getElementById("error");
      el.textContent = ERROR_TEXT[error] ?? "Sign-in failed: " + error;
      el.hidden = false;
    }
    const out = (v) => (document.getElementById("out").textContent = JSON.stringify(v, null, 2));
    const page = location.pathname;

    document.getElementById("sign-in").onclick = async () => {
      const res = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: page, errorCallbackURL: page }),
      });
      const body = await res.json();
      if (body.url) location.href = body.url; else out(body);
    };
    document.getElementById("session").onclick = async () => {
      out(await (await fetch("/api/auth/get-session")).json());
    };
    document.getElementById("sign-out").onclick = async () => {
      const res = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      out(await res.json());
    };
  </script>
</body>
</html>`;
