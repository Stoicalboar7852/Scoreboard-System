import { expect, test } from '@playwright/test';
import { enterPin, startTonight } from './helpers.js';

/** §4.4 / §11: Wi-Fi drops mid half — the clock keeps counting, taps queue and replay on reconnect. */
test('controller survives a network drop: clock keeps counting, taps replay in order', async ({
  browser,
  request,
  baseURL,
}) => {
  const base = baseURL as string;
  const night = await startTonight(request, base);
  try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const controller = await context.newPage();
    await controller.goto(`${base}/controller`);
    await enterPin(controller);
    await controller.getByRole('button', { name: night.court.courtName, exact: true }).click();
    await expect(controller.locator('[data-phase-label]')).toHaveText('Half 1');
    const before = night.court.homeScore;

    const readClock = () => controller.locator('[data-clock-state] span').last().textContent();
    const t1 = await readClock();

    await context.setOffline(true);
    await expect(controller.locator('[data-status]')).toHaveAttribute(
      'data-status',
      /reconnecting|offline/,
      { timeout: 15_000 },
    );
    await controller.getByRole('button', { name: 'Home plus one' }).click();
    await controller.waitForTimeout(300);
    await controller.getByRole('button', { name: 'Home plus one' }).click();
    await controller.waitForTimeout(300);
    await controller.getByRole('button', { name: 'Away plus one' }).click();
    // Optimistic display while offline, with a queued counter.
    await expect(controller.locator('[data-score="home"]')).toHaveText(String(before + 2));
    await expect(controller.getByText('3 queued')).toBeVisible();
    await controller.waitForTimeout(2500);
    const t2 = await readClock();
    expect(t2).not.toBe(t1); // the countdown kept moving without a server

    await context.setOffline(false);
    await expect(controller.locator('[data-status]')).toHaveAttribute('data-status', 'connected', {
      timeout: 20_000,
    });
    await expect(controller.getByText(/queued/)).toHaveCount(0, { timeout: 10_000 });

    // The server received the taps in order and the scoreboard agrees.
    const board = await browser.newPage();
    await board.goto(`${base}/scoreboard/${night.court.courtId}`);
    await expect(board.locator('[data-score="home"]')).toHaveText(String(before + 2), {
      timeout: 10_000,
    });
    await expect(board.locator('[data-score="away"]')).toHaveText(
      String(night.court.awayScore + 1),
    );
    await board.close();
    await context.close();
  } finally {
    await night.admin.emit('session:end', { sessionId: night.sessionId });
    night.admin.close();
  }
});
