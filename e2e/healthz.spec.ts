import { expect, test } from '@playwright/test';

test('server health check responds', async ({ request }) => {
  const res = await request.get('/healthz');
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { status: string };
  expect(body.status).toBe('ok');
});
