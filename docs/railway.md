# Deploy Undertone on Railway

Undertone runs as one service with a persistent volume. The repository includes a production `Dockerfile` and an Infrastructure as Code template at `.railway/railway.ts` using the pinned `railway` SDK. No database service is needed.

## Dashboard deployment

This path works from a browser, including a phone.

1. Sign in to [Railway](https://railway.com), create an empty project, and add an empty service named **undertone**.
2. Add a volume mounted at **`/data`**. Keep one replica in the same region as the volume. This stores favorites, playlists, and settings; the container filesystem alone does not survive replacement. Enable volume backups if these collections matter to you.
3. In **Settings → Networking**, generate a public domain with target port **3000**.
4. Add the following service variables. Set `APP_PASSWORD` to your own long, unique password; it is the password for the app's login screen.

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `HOST` | `0.0.0.0` |
   | `PORT` | `3000` |
   | `DATA_DIR` | `/data` |
   | `APP_PASSWORD` | Your unique password, at least 24 characters recommended |
   | `PUBLIC_ORIGIN` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` |

5. Set **Healthcheck Path** to **`/healthz`**, timeout **60 seconds**, and restart policy **On Failure** with **3 retries**. Leave the build and start commands empty: the Dockerfile supplies both. Disable serverless sleeping for uninterrupted listening.
6. Connect the GitHub repository **`setanputih152-afk/hc`**, select branch **`hoplite/halikarnassos-8912bac6`**, and keep the root directory at `/`. Grant Railway access to that repository when prompted. Deploy the service.
7. Open the generated HTTPS domain and log in using `APP_PASSWORD`. Check `/healthz` for HTTP 200, then test searching, playback, seeking, and lyrics from your deployment.

For a custom domain, set `PUBLIC_ORIGIN` to its exact HTTPS origin and redeploy. Only the configured origin is accepted for application requests. The public healthcheck exposes only `{ "status": "ok" }`, not playback metadata or credentials.

## Infrastructure as Code template

Use this path on a machine with Node.js 22.12+ and npm, such as Linux, macOS, or WSL. The template creates the service, attaches a 1 GiB volume in `us-west2`, selects this repository's published branch, and configures the environment and healthcheck.

```sh
git clone --branch hoplite/halikarnassos-8912bac6 https://github.com/setanputih152-afk/hc.git undertone
cd undertone
npm ci
npm install -g @railway/cli@5.57.7
railway login --browserless
railway init
```

Use a new, empty project for this template. Before applying it, create a **shared variable** named **`APP_PASSWORD`** in the target Railway environment. Set it to your unique app password. The template references that shared variable without storing the password in Git.

```sh
railway config plan
railway config apply
railway domain --service undertone --port 3000
railway redeploy --service undertone
```

Review the plan before confirming the apply. Generated Railway domains are not managed by the IaC file, so the domain command is a separate step. The first deployment can fail until the domain exists and `PUBLIC_ORIGIN` resolves; redeploy after domain creation. Later source pushes to the configured branch can trigger Railway deployments. Keep a single replica because collections are stored on one volume.

The CLI login, resource creation, and deployment happen in your Railway account and can incur Railway usage charges. This repository does not contain Railway credentials or an already-published Marketplace template URL.

## Publish a one-click template

1. In the working Railway project's settings, choose **Generate Template from Project → Create Template**. Alternatively, start with **Workspace → Templates → New Template** and add the same service and volume.
2. Set the source repository to:

   ```text
   https://github.com/setanputih152-afk/hc/tree/hoplite/halikarnassos-8912bac6
   ```

3. Include the `/data` volume, public HTTP networking on port 3000, Dockerfile build, one replica, `/healthz` healthcheck, and variables from the dashboard table.
4. Replace the deployed password or shared-password reference with **`${{secret(32)}}`** in the template's `APP_PASSWORD` field. Keep `PUBLIC_ORIGIN` as **`https://${{RAILWAY_PUBLIC_DOMAIN}}`**. The secret function is evaluated by the template deployment system; do not paste it as the password of a normal running service.
5. Remove personal values and account-specific references, create the template, and copy the URL Railway actually generates. Recipients find their generated app password in the deployed service's Variables tab. Publish to the Marketplace only if you want the template publicly listed.

## Operational checks

- Redeploy once and confirm saved songs and playlists remain. Session cookies are held in memory, so signing in again after a restart is expected.
- A healthy web process does not guarantee access to music providers. Datacenter IPs can receive verification challenges, rate limits, or regional restrictions; test actual playback on Railway. The app does not bypass these restrictions.
- Audio is proxied through Railway, so listening consumes network egress. Monitor service memory, outbound bandwidth, and account spending limits.
- Do not mount `/data` during the image build or put `.env`, cookies, or tokens into the image. `.dockerignore` excludes local secrets, collections, dependencies, and development artifacts.
- Volume-backed services can have brief downtime during redeployment. Back up the volume before changing its placement or removing it.

## References

- [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code)
- [IaC TypeScript reference](https://docs.railway.com/infrastructure-as-code/reference)
- [Dockerfile builds](https://docs.railway.com/builds/dockerfiles)
- [Healthchecks](https://docs.railway.com/deployments/healthchecks)
- [Public networking and ports](https://docs.railway.com/networking/public-networking)
- [Creating templates and generated secrets](https://docs.railway.com/templates/create)

Checked against the official documentation on 17 September 2026. Railway Infrastructure as Code is the current project template format; this repository does not depend on legacy `railway.json` configuration.
