import { defineRailway, github, project, service, volume } from 'railway/iac';

export default defineRailway((ctx) => {
  const data = volume('undertone-data', {
    region: 'us-west2',
    sizeMB: 1024,
  });
  const app = service('undertone', {
    source: github('setanputih125-coder/hc', {
      branch: 'hoplite/halikarnassos-8912bac6',
    }),
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    healthcheck: '/healthz',
    healthcheckTimeout: 60,
    deploy: {
      region: 'us-west2',
      numReplicas: 1,
      sleepApplication: false,
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 3,
    },
    env: {
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: '3000',
      DATA_DIR: '/data',
      TRUST_PROXY: '1',
      APP_PASSWORD: ctx.shared.APP_PASSWORD,
      PUBLIC_ORIGIN: 'https://${{RAILWAY_PUBLIC_DOMAIN}}',
    },
    volumeMounts: { '/data': data },
  });
  return project('undertone', { resources: [app, data] });
});
