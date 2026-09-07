import type { LadderRow, LadderRule } from '@scoreboard/shared';

interface Props {
  rows: LadderRow[];
  rule?: LadderRule | null;
  /** Highlight these team ids (e.g. finals qualifiers). */
  highlight?: number;
  compact?: boolean;
}

/** Ladder table shared by the admin and public pages. Columns follow §9 row fields. */
export function LadderTable({ rows, rule, highlight = 0, compact = false }: Props) {
  const showBonus = rule ? rule.bonus !== null : rows.some((r) => r.bonusPoints !== 0);
  const showAdjust = rows.some((r) => r.adjustments !== 0);
  const showByes = rows.some((r) => r.byes > 0);
  const showForfeits = rows.some((r) => r.forfeits > 0);
  const cell = compact ? 'px-2 py-1' : 'px-3 py-2';
  return (
    <div className="overflow-x-auto rounded-lg border border-border" data-ladder-table>
      <table
        className={`w-full text-left ${compact ? 'text-xs' : 'text-sm'}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        <thead className="bg-surface-2 text-text-muted">
          <tr>
            <th className={cell}>#</th>
            <th className={cell}>Team</th>
            <th className={`${cell} text-right`}>P</th>
            <th className={`${cell} text-right`}>W</th>
            <th className={`${cell} text-right`}>D</th>
            <th className={`${cell} text-right`}>L</th>
            {showByes && <th className={`${cell} text-right`}>Bye</th>}
            {showForfeits && <th className={`${cell} text-right`}>FF</th>}
            <th className={`${cell} text-right`}>For</th>
            <th className={`${cell} text-right`}>Agst</th>
            <th className={`${cell} text-right`}>Diff</th>
            <th className={`${cell} text-right`}>%</th>
            {showBonus && (
              <th className={`${cell} text-right`} title="Bonus points">
                Bonus
              </th>
            )}
            {showAdjust && <th className={`${cell} text-right`}>Adj</th>}
            <th className={`${cell} text-right font-bold text-court`}>Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.teamId}
              className={`border-t border-border ${r.position <= highlight ? 'bg-court/10' : ''}`}
              data-ladder-row={r.teamId}
            >
              <td className={`${cell} text-text-muted`}>{r.position}</td>
              <td className={`${cell} font-semibold text-team`}>{r.teamName}</td>
              <td className={`${cell} text-right`}>{r.played}</td>
              <td className={`${cell} text-right`}>{r.won}</td>
              <td className={`${cell} text-right`}>{r.drawn}</td>
              <td className={`${cell} text-right`}>{r.lost}</td>
              {showByes && <td className={`${cell} text-right`}>{r.byes}</td>}
              {showForfeits && <td className={`${cell} text-right`}>{r.forfeits}</td>}
              <td className={`${cell} text-right`}>{r.pointsFor}</td>
              <td className={`${cell} text-right`}>{r.pointsAgainst}</td>
              <td className={`${cell} text-right`}>
                {r.pointsDiff > 0 ? `+${r.pointsDiff}` : r.pointsDiff}
              </td>
              <td className={`${cell} text-right`}>{r.percentage.toFixed(1)}</td>
              {showBonus && <td className={`${cell} text-right text-info`}>{r.bonusPoints}</td>}
              {showAdjust && (
                <td className={`${cell} text-right text-warning`}>
                  {r.adjustments > 0 ? `+${r.adjustments}` : r.adjustments}
                </td>
              )}
              <td className={`${cell} text-right text-lg font-bold text-court`} data-ladder-points>
                {r.ladderPoints}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={12} className={`${cell} text-center text-text-muted`}>
                No teams yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Explains the scoring rule under a ladder. */
export function ladderRuleSummary(rule: LadderRule): string {
  const parts = [`Win ${rule.win}`, `Draw ${rule.draw}`, `Loss ${rule.loss}`, `Bye ${rule.bye}`];
  if (rule.bonus)
    parts.push(
      `+${rule.bonus.points} bonus per ${rule.bonus.perScorePoints} points scored${rule.bonus.cap !== null ? ` (max ${rule.bonus.cap})` : ''}`,
    );
  return parts.join(' · ');
}
