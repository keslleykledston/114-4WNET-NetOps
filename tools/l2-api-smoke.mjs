const base = process.env.API_BASE ?? "http://127.0.0.1:8080";

async function login() {
  const email = process.env.ADMIN_EMAIL ?? "admin@local.test";
  const password = process.env.ADMIN_PASSWORD ?? "changeme";
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await r.json().catch(() => ({}));
  const cookie = r.headers.get("set-cookie")?.split(";")[0];
  return { status: r.status, cookie, token: body.token, body };
}

const auth = await login();
console.log("LOGIN", auth.status, auth.token ? "token_ok" : "no_token");

const headers = {
  "Content-Type": "application/json",
  ...(auth.cookie ? { Cookie: auth.cookie } : {}),
  ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
};

const list = await fetch(`${base}/api/l2-circuits`, { headers });
console.log("GET_LIST", list.status, (await list.text()).slice(0, 200));

const fakeJob = await fetch(`${base}/api/l2-circuits/discovery-jobs/disc-l2-fake-1`, { headers });
console.log("GET_JOB_FAKE", fakeJob.status, (await fakeJob.text()).slice(0, 120));

const postInvalid = await fetch(`${base}/api/l2-circuits/discover`, {
  method: "POST",
  headers,
  body: JSON.stringify({ device_id: 999999 }),
});
console.log("POST_INVALID", postInvalid.status, (await postInvalid.text()).slice(0, 120));

const deviceId = Number(process.env.L2_TEST_DEVICE_ID ?? "1");
const postDev = await fetch(`${base}/api/l2-circuits/discover`, {
  method: "POST",
  headers,
  body: JSON.stringify({ device_id: deviceId }),
});
const postDevText = await postDev.text();
console.log("POST_DEVICE", deviceId, postDev.status, postDevText.slice(0, 220));

if (postDev.status === 202) {
  const { run_id: runId } = JSON.parse(postDevText);
  await new Promise((r) => setTimeout(r, 800));
  const job = await fetch(`${base}/api/l2-circuits/discovery-jobs/${runId}`, { headers });
  const jobText = await job.text();
  console.log("POLL_JOB", job.status, jobText.slice(0, 280));
  console.log("RUN_ID_MATCH", jobText.includes(runId));
}
