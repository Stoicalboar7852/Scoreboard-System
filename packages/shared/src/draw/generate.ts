import { buildClashSet } from '../clash/validate.js';
import { formatSlotMinutes } from '../time/format.js';
import {
  assignNight,
  type AssignFailureCause,
  type AssignFixture,
  type SoftContext,
} from './assign.js';
import { sessionDates } from './dates.js';
import { createRng } from './random.js';
import { roundRobin, type RoundRobinPairing } from './roundRobin.js';

export interface DrawCompetition {
  id: string;
  name: string;
  nightOfWeek: number;
  formatId: string;
  teamIds: string[];
}

export interface DrawCourt {
  id: string;
  name: string;
  supportedFormatIds: string[];
}

export interface DrawFormat {
  id: string;
  name: string;
  halfSeconds: number;
  halfTimeSeconds: number;
  betweenGamesSeconds: number;
}

export interface DrawNight {
  nightOfWeek: number;
  courtIds: string[];
  firstSlotTime: string;
  linkShorterToLonger: boolean;
  /** Extra slots the generator may open beyond the computed minimum (default 0). */
  extraSlots?: number;
}

export interface DrawClash {
  teamAId: string;
  teamBId: string;
}

export interface DrawInput {
  weeks: number;
  startDate: string;
  skippedDates: string[];
  competitions: DrawCompetition[];
  courts: DrawCourt[];
  formats: DrawFormat[];
  nights: DrawNight[];
  clashes: DrawClash[];
  seed?: number;
  options?: {
    maxRestarts?: number;
    maxNodes?: number;
    localSearchIterations?: number;
  };
}

export interface DrawFixture {
  competitionId: string;
  roundNumber: number;
  homeTeamId: string;
  awayTeamId: string | null;
  slotIndex: number | null;
  courtId: string | null;
  status: 'SCHEDULED' | 'BYE';
}

export interface DrawSession {
  date: string;
  nightOfWeek: number;
  weekNumber: number;
  firstSlotTime: string;
  slotLengthMinutes: number;
  slotCount: number;
  linkShorterToLonger: boolean;
  fixtures: DrawFixture[];
}

export interface DrawConflict {
  date: string;
  nightOfWeek: number;
  weekNumber: number;
  fixture: { competitionId: string; homeTeamId: string; awayTeamId: string | null };
  reason: string;
  suggestions: string[];
}

export interface DrawStats {
  nightsPlanned: number;
  restarts: number;
  elapsedMs: number;
}

export type DrawResult =
  | { ok: true; sessions: DrawSession[]; warnings: string[]; stats: DrawStats }
  | { ok: false; sessions: []; conflicts: DrawConflict[]; warnings: string[]; stats: DrawStats };

interface NightPlan {
  night: DrawNight;
  courts: DrawCourt[];
  competitions: DrawCompetition[];
  formats: DrawFormat[];
  slotLengthMinutes: number;
  dates: string[];
}

function planNight(input: DrawInput, night: DrawNight, competitions: DrawCompetition[]): NightPlan {
  const courts = night.courtIds
    .map((id) => input.courts.find((c) => c.id === id))
    .filter((c): c is DrawCourt => c !== undefined);
  const formatIds = new Set(competitions.map((c) => c.formatId));
  const formats = input.formats.filter((f) => formatIds.has(f.id));
  const slotLengthMinutes = Math.max(1, ...formats.map(formatSlotMinutes));
  const dates = sessionDates(input.startDate, input.weeks, night.nightOfWeek, input.skippedDates);
  return { night, courts, competitions, formats, slotLengthMinutes, dates };
}

/** Minimum slots so that total fixtures and each format's fixtures fit the courts. */
function minimumSlots(fixtures: AssignFixture[], courts: DrawCourt[], linked: boolean): number {
  if (fixtures.length === 0) return 0;
  let slots = Math.ceil(fixtures.length / Math.max(1, courts.length));
  const byFormat = new Map<string, number>();
  for (const f of fixtures) byFormat.set(f.formatId, (byFormat.get(f.formatId) ?? 0) + 1);
  for (const [formatId, count] of byFormat) {
    const supporting = courts.filter((c) => c.supportedFormatIds.includes(formatId)).length;
    if (supporting === 0) return Number.POSITIVE_INFINITY;
    slots = Math.max(slots, Math.ceil(count / supporting));
  }
  if (!linked && byFormat.size > 1) {
    // Courts are partitioned by format: allocate proportionally and take the worst case.
    let allocated = 0;
    const entries = [...byFormat.entries()];
    for (const [formatId, count] of entries) {
      const share = Math.max(1, Math.round((count / fixtures.length) * courts.length));
      const supporting = courts.filter((c) => c.supportedFormatIds.includes(formatId)).length;
      const usable = Math.min(share, supporting, courts.length - allocated);
      if (usable <= 0) return Number.POSITIVE_INFINITY;
      slots = Math.max(slots, Math.ceil(count / usable));
      allocated += usable;
    }
  }
  return slots;
}

function suggestionsFor(
  fixture: AssignFixture,
  cause: AssignFailureCause,
  clashes: Set<string>,
  competitions: DrawCompetition[],
): string[] {
  const suggestions: string[] = [];
  const involved = [...clashes].filter((key) => {
    const [a, b] = key.split('|');
    return [a, b].includes(fixture.homeTeamId) || [a, b].includes(fixture.awayTeamId);
  });
  if (cause === 'NO_COURT_FOR_FORMAT') {
    suggestions.push(
      `Add a court that supports this format to the night, or enable it on an existing court`,
    );
  } else {
    suggestions.push('Allow one more slot on this night (increase "extra slots")');
    suggestions.push('Add another court to this night');
    if (involved.length > 0) {
      suggestions.push(
        `Remove or review clash links involving these teams: ${involved.join(', ')}`,
      );
    }
    const comp = competitions.find((c) => c.id === fixture.competitionId);
    if (comp) suggestions.push(`Move ${comp.name} to another night`);
  }
  return suggestions;
}

/**
 * Generates a full regular-season draw (§8). Pure and deterministic for a given seed.
 * Returns either every session or a structured conflict report — never a partial draw.
 */
export function generateDraw(input: DrawInput): DrawResult {
  const started = Date.now();
  const rng = createRng(input.seed ?? 1);
  const warnings: string[] = [];
  const conflicts: DrawConflict[] = [];
  const clashes = buildClashSet(input.clashes);
  const maxRestarts = input.options?.maxRestarts ?? 8;
  let restarts = 0;

  // Pairings per competition.
  const pairings = new Map<string, RoundRobinPairing[]>();
  for (const comp of input.competitions) {
    const rr = roundRobin(comp.teamIds, input.weeks);
    pairings.set(comp.id, rr.pairings);
    warnings.push(...rr.warnings.map((w) => `${comp.name}: ${w}`));
  }

  // Nights that actually have competitions.
  const nightsWithComps = [...new Set(input.competitions.map((c) => c.nightOfWeek))].sort(
    (a, b) => a - b,
  );
  const plans: NightPlan[] = [];
  for (const nightOfWeek of nightsWithComps) {
    const comps = input.competitions.filter((c) => c.nightOfWeek === nightOfWeek);
    const night = input.nights.find((n) => n.nightOfWeek === nightOfWeek);
    const plan = planNight(
      input,
      night ?? { nightOfWeek, courtIds: [], firstSlotTime: '18:00', linkShorterToLonger: false },
      comps,
    );
    if (plan.courts.length === 0) {
      const first = comps[0] as DrawCompetition;
      conflicts.push({
        date: plan.dates[0] ?? input.startDate,
        nightOfWeek,
        weekNumber: 1,
        fixture: {
          competitionId: first.id,
          homeTeamId: first.teamIds[0] ?? '',
          awayTeamId: first.teamIds[1] ?? null,
        },
        reason: `No courts are configured for ${plan.dates.length ? 'this night' : 'the night'} (night ${nightOfWeek})`,
        suggestions: ['Add at least one court to this night in the season wizard'],
      });
      continue;
    }
    plans.push(plan);
  }

  const sessions: DrawSession[] = [];
  for (const plan of plans) {
    const slotHistory = new Map<string, number[]>();
    let lastWeekSlot = new Map<string, number>();

    for (let week = 1; week <= input.weeks; week++) {
      const date = plan.dates[week - 1] as string;
      const fixtures: DrawFixture[] = [];
      const toPlace: AssignFixture[] = [];
      for (const comp of plan.competitions) {
        for (const p of (pairings.get(comp.id) ?? []).filter((x) => x.round === week)) {
          if (p.awayTeamId === null) {
            fixtures.push({
              competitionId: comp.id,
              roundNumber: week,
              homeTeamId: p.homeTeamId,
              awayTeamId: null,
              slotIndex: null,
              courtId: null,
              status: 'BYE',
            });
          } else {
            toPlace.push({
              key: `${comp.id}|${p.homeTeamId}|${p.awayTeamId}`,
              competitionId: comp.id,
              formatId: comp.formatId,
              homeTeamId: p.homeTeamId,
              awayTeamId: p.awayTeamId,
            });
          }
        }
      }

      const linked = plan.night.linkShorterToLonger;
      const minSlots = minimumSlots(toPlace, plan.courts, linked);
      const extra = plan.night.extraSlots ?? 0;
      let placed = false;
      let lastFailure: {
        fixture: AssignFixture;
        cause: AssignFailureCause;
        reason: string;
      } | null = null;

      if (Number.isFinite(minSlots)) {
        outer: for (let slotCount = minSlots; slotCount <= minSlots + extra; slotCount++) {
          for (let attempt = 0; attempt <= maxRestarts; attempt++) {
            const soft: SoftContext = { slotHistory, lastWeekSlot };
            const result = assignNight({
              fixtures: toPlace,
              courts: plan.courts,
              slotCount,
              clashes,
              linked,
              soft,
              rng,
              maxNodes: input.options?.maxNodes,
              localSearchIterations: input.options?.localSearchIterations,
            });
            if (result.ok) {
              const byKey = new Map(result.placements.map((p) => [p.key, p]));
              const nextLast = new Map<string, number>();
              for (const f of toPlace) {
                const placement = byKey.get(f.key);
                if (!placement) continue;
                fixtures.push({
                  competitionId: f.competitionId,
                  roundNumber: week,
                  homeTeamId: f.homeTeamId,
                  awayTeamId: f.awayTeamId,
                  slotIndex: placement.slotIndex,
                  courtId: placement.courtId,
                  status: 'SCHEDULED',
                });
                for (const team of [f.homeTeamId, f.awayTeamId]) {
                  const history = slotHistory.get(team) ?? [];
                  history[placement.slotIndex] = (history[placement.slotIndex] ?? 0) + 1;
                  slotHistory.set(team, history);
                  nextLast.set(team, placement.slotIndex);
                }
              }
              lastWeekSlot = nextLast;
              sessions.push({
                date,
                nightOfWeek: plan.night.nightOfWeek,
                weekNumber: week,
                firstSlotTime: plan.night.firstSlotTime,
                slotLengthMinutes: plan.slotLengthMinutes,
                slotCount,
                linkShorterToLonger: linked,
                fixtures,
              });
              placed = true;
              break outer;
            }
            lastFailure = { fixture: result.unplaced, cause: result.cause, reason: result.reason };
            restarts += 1;
          }
        }
      } else {
        const first = toPlace[0];
        if (first) {
          lastFailure = {
            fixture: first,
            cause: 'NO_COURT_FOR_FORMAT',
            reason: 'No court on this night supports the game format',
          };
        }
      }

      if (!placed) {
        const failed = lastFailure ?? {
          fixture: toPlace[0] as AssignFixture,
          cause: 'NO_CELL' as const,
          reason: 'Could not place fixtures',
        };
        conflicts.push({
          date,
          nightOfWeek: plan.night.nightOfWeek,
          weekNumber: week,
          fixture: {
            competitionId: failed.fixture.competitionId,
            homeTeamId: failed.fixture.homeTeamId,
            awayTeamId: failed.fixture.awayTeamId,
          },
          reason: failed.reason,
          suggestions: suggestionsFor(failed.fixture, failed.cause, clashes, plan.competitions),
        });
      }
    }
  }

  const stats: DrawStats = {
    nightsPlanned: sessions.length,
    restarts,
    elapsedMs: Date.now() - started,
  };
  if (conflicts.length > 0) return { ok: false, sessions: [], conflicts, warnings, stats };
  sessions.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.nightOfWeek - b.nightOfWeek,
  );
  return { ok: true, sessions, warnings, stats };
}
