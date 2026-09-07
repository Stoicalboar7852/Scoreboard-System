import { expect, test } from '@playwright/test';
import { enterPin, startTonight } from './helpers.js';

test.describe('referee scores on the controller, scoreboard follows', () => {
  test('tap + on the controller and the scoreboard shows the new score', async ({
    browser,
    request,
    baseURL,
  }) => {
    const base = baseURL as string;
    const night = await startTonight(request, base);
    try {
      const controllerContext = await browser.newContext({
        viewport: { width: 1024, height: 768 },
      });
      const controller = await controllerContext.newPage();
      await controller.goto(`${base}/controller`);
      await enterPin(controller);
      await controller.getByRole('button', { name: night.court.courtName, exact: true }).click();
      await expect(controller).toHaveURL(new RegExp(`/controller/${night.court.courtId}$`));
      await expect(controller.locator('[data-team="home"]')).toHaveText(
        night.court.current?.homeName ?? '',
      );
      await expect(controller.locator('[data-phase-label]')).toHaveText('Half 1');

      const boardContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const board = await boardContext.newPage();
      await board.goto(`${base}/scoreboard/${night.court.courtId}`);
      await expect(board.locator('[data-score="home"]')).toHaveText(String(night.court.homeScore));

      const before = night.court.homeScore;
      await controller.getByRole('button', { name: 'Home plus one' }).click();
      await expect(controller.locator('[data-score="home"]')).toHaveText(String(before + 1));
      await expect(board.locator('[data-score="home"]')).toHaveText(String(before + 1), {
        timeout: 5000,
      });

      // Two taps at referee speed; taps inside the 220 ms double-tap guard are ignored by design.
      await controller.getByRole('button', { name: 'Away plus one' }).click();
      await controller.waitForTimeout(300);
      await controller.getByRole('button', { name: 'Away plus one' }).click();
      await expect(board.locator('[data-score="away"]')).toHaveText(
        String(night.court.awayScore + 2),
        { timeout: 5000 },
      );

      await controller.getByRole('button', { name: 'Time out' }).click();
      await expect(board.locator('[data-phase-label]')).toHaveText('Time out');
      await expect(controller.getByRole('button', { name: 'End time out' })).toBeVisible();
      await controller.getByRole('button', { name: 'End time out' }).click();
      await expect(board.locator('[data-phase-label]')).toHaveText('Half 1');

      await controllerContext.close();
      await boardContext.close();
    } finally {
      await night.admin.emit('session:end', { sessionId: night.sessionId });
      night.admin.close();
    }
  });
});
