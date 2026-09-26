// payoutdemo.avvio.xyz: every request goes to one shared container running
// the demo in public mode (see api/src/visitor.ts). The sandbox key lives in
// Worker secrets and reaches the container as an environment variable.
import { Container, getContainer } from '@cloudflare/containers';

export class PayoutDemo extends Container {
  defaultPort = 4300;
  // ponytail: state lives on the container's disk and resets when it sleeps. Fine for a demo; persist to this.ctx.storage if visitors need it to survive.
  sleepAfter = '2h';

  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = { AVVIO_API_KEY: env.AVVIO_API_KEY, AVVIO_ORG_ID: env.AVVIO_ORG_ID };
  }
}

export default {
  fetch(request, env) {
    // One container per deploy: a running container keeps its image, so a new
    // deploy gets a fresh one and the previous one sleeps on its own.
    return getContainer(env.PAYOUT_DEMO, `shared-${env.DEPLOY_ID ?? 'local'}`).fetch(request);
  },
};
