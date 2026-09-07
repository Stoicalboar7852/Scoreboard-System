import {
  LADDER_RULE_PRESETS,
  LADDER_TIEBREAKERS,
  detectLadderPreset,
  type LadderRule,
  type LadderRulePresetKey,
  type LadderTiebreaker,
} from '@scoreboard/shared';
import { Button, Checkbox, Field, Select, TextInput } from '../../../components/ui/index.js';

interface Props {
  value: LadderRule;
  onChange: (rule: LadderRule) => void;
}

const TIEBREAKER_LABELS: Record<LadderTiebreaker, string> = {
  LADDER_POINTS: 'Ladder points',
  WINS: 'Wins',
  PERCENTAGE: 'Percentage (for ÷ against)',
  POINTS_DIFF: 'Points difference',
  POINTS_FOR: 'Points for',
  HEAD_TO_HEAD: 'Head to head',
  NAME: 'Team name',
};

/** Ladder rule editor with presets (§7.4). Any manual change becomes "Custom". */
export function LadderRuleEditor({ value, onChange }: Props) {
  const preset = detectLadderPreset(value);
  const set = (patch: Partial<LadderRule>) => onChange({ ...value, ...patch } as LadderRule);
  const num = (
    key: 'win' | 'draw' | 'loss' | 'bye' | 'forfeitWin' | 'forfeitLoss',
    label: string,
  ) => (
    <Field label={label} key={key}>
      <TextInput
        type="number"
        value={value[key]}
        onChange={(e) => set({ [key]: Number(e.target.value) || 0 })}
        aria-label={label}
      />
    </Field>
  );
  const moveTiebreaker = (index: number, dir: -1 | 1) => {
    const next = value.tiebreakers.slice();
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    const tmp = next[index] as LadderTiebreaker;
    next[index] = next[target] as LadderTiebreaker;
    next[target] = tmp;
    set({ tiebreakers: next });
  };
  const toggleTiebreaker = (key: LadderTiebreaker, on: boolean) => {
    const next = on ? [...value.tiebreakers, key] : value.tiebreakers.filter((t) => t !== key);
    if (next.length > 0) set({ tiebreakers: next });
  };

  return (
    <div className="space-y-4" data-ladder-rule-editor>
      <Field label="Preset">
        <Select
          value={preset}
          onChange={(e) => {
            const key = e.target.value as LadderRulePresetKey | 'CUSTOM';
            if (key !== 'CUSTOM') onChange(structuredClone(LADDER_RULE_PRESETS[key].rule));
          }}
          aria-label="Ladder rule preset"
        >
          {Object.entries(LADDER_RULE_PRESETS).map(([key, p]) => (
            <option key={key} value={key}>
              {p.label}
            </option>
          ))}
          <option value="CUSTOM">Custom</option>
        </Select>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        {num('win', 'Win')}
        {num('draw', 'Draw')}
        {num('loss', 'Loss')}
        {num('bye', 'Bye')}
        {num('forfeitWin', 'Forfeit win')}
        {num('forfeitLoss', 'Forfeit loss')}
      </div>
      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 text-sm text-text-muted">Bonus points</legend>
        <Checkbox
          label="Award bonus points for score"
          checked={value.bonus !== null}
          onChange={(e) =>
            set({ bonus: e.target.checked ? { perScorePoints: 10, points: 1, cap: null } : null })
          }
        />
        {value.bonus && (
          <div className="mt-2 grid grid-cols-3 gap-3">
            <Field label="Every N score points">
              <TextInput
                type="number"
                min={1}
                value={value.bonus.perScorePoints}
                onChange={(e) =>
                  set({
                    bonus: {
                      ...value.bonus!,
                      perScorePoints: Math.max(1, Number(e.target.value) || 1),
                    },
                  })
                }
                aria-label="Bonus per score points"
              />
            </Field>
            <Field label="earn ladder points">
              <TextInput
                type="number"
                min={1}
                value={value.bonus.points}
                onChange={(e) =>
                  set({
                    bonus: { ...value.bonus!, points: Math.max(1, Number(e.target.value) || 1) },
                  })
                }
                aria-label="Bonus points"
              />
            </Field>
            <Field label="Cap per game (blank = none)">
              <TextInput
                type="number"
                min={0}
                value={value.bonus.cap ?? ''}
                onChange={(e) =>
                  set({
                    bonus: {
                      ...value.bonus!,
                      cap: e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
                aria-label="Bonus cap"
              />
            </Field>
          </div>
        )}
      </fieldset>
      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 text-sm text-text-muted">Tiebreakers (in order)</legend>
        <ol className="space-y-1">
          {value.tiebreakers.map((t, i) => (
            <li key={t} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-text-muted">{i + 1}.</span>
              <span className="flex-1">{TIEBREAKER_LABELS[t]}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => moveTiebreaker(i, -1)}
                aria-label={`Move ${TIEBREAKER_LABELS[t]} up`}
                disabled={i === 0}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => moveTiebreaker(i, 1)}
                aria-label={`Move ${TIEBREAKER_LABELS[t]} down`}
                disabled={i === value.tiebreakers.length - 1}
              >
                ↓
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toggleTiebreaker(t, false)}
                aria-label={`Remove ${TIEBREAKER_LABELS[t]}`}
                disabled={value.tiebreakers.length === 1}
              >
                ×
              </Button>
            </li>
          ))}
        </ol>
        <div className="mt-2 flex flex-wrap gap-2">
          {LADDER_TIEBREAKERS.filter((t) => !value.tiebreakers.includes(t)).map((t) => (
            <Button key={t} size="sm" onClick={() => toggleTiebreaker(t, true)}>
              + {TIEBREAKER_LABELS[t]}
            </Button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
