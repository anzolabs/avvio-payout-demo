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
  async fetch(request, env) {
    const demo = getContainer(env.PAYOUT_DEMO, 'shared');
    // The deploy job calls this once the new image has rolled out: a running
    // container keeps the image it started with, so it is stopped and the next
    // request starts one on the new image. The token is minted per deploy.
    if (new URL(request.url).pathname === '/__deploy/restart') {
      const ok = request.method === 'POST' && env.RESTART_TOKEN && request.headers.get('authorization') === `Bearer ${env.RESTART_TOKEN}`;
      if (!ok) return new Response('Not found', { status: 404 });
      await demo.destroy();
      return new Response('restarted');
    }
    return demo.fetch(request);
  },
};
