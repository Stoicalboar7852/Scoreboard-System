import { describe, expect, it } from 'vitest';
import { DEFAULT_FINALS_TEMPLATE, finalsTemplateSchema, type FinalsTemplate } from './template.js';
import {
  decideFinal,
  placeholderLabel,
  resolveFinals,
  type FinalsResultInput,
  type FinalsSeed,
} from './resolve.js';

const seeds: FinalsSeed[] = [
  { seed: 1, teamId: 'A', teamName: 'Aces' },
  { seed: 2, teamId: 'B', teamName: 'Blockers' },
  { seed: 3, teamId: 'C', teamName: 'Crushers' },
  { seed: 4, teamId: 'D', teamName: 'Diggers' },
];

function result(partial: Partial<FinalsResultInput> & { key: string }): FinalsResultInput {
  return {
    homeTeamId: null,
    awayTeamId: null,
    homeScore: 0,
    awayScore: 0,
    status: 'COMPLETED',
    forfeitBy: null,
    ...partial,
  };
}

describe('placeholderLabel', () => {
  it('describes each reference kind', () => {
    expect(placeholderLabel({ seed: 1 })).toBe('1st');
    expect(placeholderLabel({ seed: 2 })).toBe('2nd');
    expect(placeholderLabel({ seed: 3 })).toBe('3rd');
    expect(placeholderLabel({ seed: 4 })).toBe('4th');
    expect(placeholderLabel({ seed: 11 })).toBe('11th');
    expect(placeholderLabel({ seed: 22 })).toBe('22nd');
    expect(placeholderLabel({ winnerOf: 'SF2' })).toBe('Winner SF2');
    expect(placeholderLabel({ loserOf: 'SF1' })).toBe('Loser SF1');
  });
});

describe('resolveFinals with the default template', () => {
  it('seeds the semi finals immediately and leaves later matches as placeholders', () => {
    const matches = resolveFinals(DEFAULT_FINALS_TEMPLATE, seeds, []);
    expect(matches.map((m) => m.key)).toEqual(['SF1', 'SF2', 'PF', 'GF']);
    const sf1 = matches[0];
    expect(sf1).toMatchObject({
      weekIndex: 0,
      weekName: 'Semi finals',
      slotOffset: 0,
      home: { teamId: 'A', label: 'Aces' },
      away: { teamId: 'B', label: 'Blockers' },
    });
    expect(matches[2]).toMatchObject({
      key: 'PF',
      slotOffset: 1,
      home: { teamId: null, label: 'Loser SF1' },
      away: { teamId: null, label: 'Winner SF2' },
    });
    expect(matches[3]).toMatchObject({ weekIndex: 1, home: { teamId: null, label: 'Winner SF1' } });
  });

  it('resolves the preliminary final once both semis are complete', () => {
    const matches = resolveFinals(DEFAULT_FINALS_TEMPLATE, seeds, [
      result({ key: 'SF1', homeTeamId: 'A', awayTeamId: 'B', homeScore: 30, awayScore: 20 }),
      result({ key: 'SF2', homeTeamId: 'C', awayTeamId: 'D', homeScore: 10, awayScore: 25 }),
    ]);
    expect(matches[2]).toMatchObject({
      home: { teamId: 'B', label: 'Blockers' },
      away: { teamId: 'D', label: 'Diggers' },
    });
    expect(matches[3]).toMatchObject({
      home: { teamId: 'A' },
      away: { teamId: null, label: 'Winner PF' },
    });
  });

  it('resolves the grand final after the preliminary final', () => {
    const matches = resolveFinals(DEFAULT_FINALS_TEMPLATE, seeds, [
      result({ key: 'SF1', homeTeamId: 'A', awayTeamId: 'B', homeScore: 30, awayScore: 20 }),
      result({ key: 'SF2', homeTeamId: 'C', awayTeamId: 'D', homeScore: 10, awayScore: 25 }),
      result({ key: 'PF', homeTeamId: 'B', awayTeamId: 'D', homeScore: 15, awayScore: 16 }),
    ]);
    expect(matches[3]).toMatchObject({ home: { teamId: 'A' }, away: { teamId: 'D' } });
  });

  it('ignores incomplete results', () => {
    const matches = resolveFinals(DEFAULT_FINALS_TEMPLATE, seeds, [
      result({
        key: 'SF1',
        homeTeamId: 'A',
        awayTeamId: 'B',
        homeScore: 30,
        awayScore: 20,
        status: 'LIVE',
      }),
    ]);
    expect(matches[2]?.home.teamId).toBeNull();
  });

  it('awards a drawn final to the higher seed (decision 8)', () => {
    expect(
      decideFinal(
        result({ key: 'SF1', homeTeamId: 'B', awayTeamId: 'A', homeScore: 20, awayScore: 20 }),
        seeds,
        'HIGHER_SEED',
      ),
    ).toEqual({ winnerId: 'A', loserId: 'B' });
    expect(
      decideFinal(
        result({ key: 'SF1', homeTeamId: 'A', awayTeamId: 'B', homeScore: 20, awayScore: 20 }),
        seeds,
        'HIGHER_SEED',
      ),
    ).toEqual({ winnerId: 'A', loserId: 'B' });
  });

  it('treats a forfeit as a win for the other side', () => {
    expect(
      decideFinal(
        result({
          key: 'SF1',
          homeTeamId: 'A',
          awayTeamId: 'B',
          status: 'FORFEIT',
          forfeitBy: 'HOME',
        }),
        seeds,
        'HIGHER_SEED',
      ),
    ).toEqual({ winnerId: 'B', loserId: 'A' });
    expect(
      decideFinal(result({ key: 'SF1', homeTeamId: 'A', awayTeamId: null }), seeds, 'HIGHER_SEED'),
    ).toBeNull();
  });

  it('marks missing seeds as unresolved when fewer teams qualify', () => {
    const matches = resolveFinals(DEFAULT_FINALS_TEMPLATE, seeds.slice(0, 3), []);
    expect(matches[1]).toMatchObject({
      home: { teamId: 'C' },
      away: { teamId: null, label: '4th' },
    });
  });
});

describe('finalsTemplateSchema', () => {
  it('accepts the default template', () => {
    expect(finalsTemplateSchema.safeParse(DEFAULT_FINALS_TEMPLATE).success).toBe(true);
  });
  it('rejects forward references and duplicate keys', () => {
    const forward: FinalsTemplate = {
      drawResolution: 'HIGHER_SEED',
      weeks: [
        {
          name: 'W',
          matches: [{ key: 'GF', home: { winnerOf: 'SF1' }, away: { seed: 1 }, slotOffset: 0 }],
        },
      ],
    };
    expect(finalsTemplateSchema.safeParse(forward).success).toBe(false);
    const dup: FinalsTemplate = {
      drawResolution: 'HIGHER_SEED',
      weeks: [
        {
          name: 'W',
          matches: [
            { key: 'SF1', home: { seed: 1 }, away: { seed: 2 }, slotOffset: 0 },
            { key: 'SF1', home: { seed: 3 }, away: { seed: 4 }, slotOffset: 0 },
          ],
        },
      ],
    };
    expect(finalsTemplateSchema.safeParse(dup).success).toBe(false);
  });
});
