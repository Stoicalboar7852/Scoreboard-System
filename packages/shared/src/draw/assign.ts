import { clashPairKey } from '../clash/validate.js';
import { type Rng } from './random.js';

export interface AssignFixture {
  key: string;
  competitionId: string;
  formatId: string;
  homeTeamId: string;
  awayTeamId: string;
}

export interface AssignCourt {
  id: string;
  supportedFormatIds: readonly string[];
}

/** Season-wide soft-constraint memory so slot usage balances over the weeks. */
export interface SoftContext {
  /** teamId → count of appearances per slot index so far this season. */
  slotHistory: ReadonlyMap<string, readonly number[]>;
  /** teamId → slot index played last week on this night. */
  lastWeekSlot: ReadonlyMap<string, number>;
}

export interface AssignInput {
  fixtures: readonly AssignFixture[];
  courts: readonly AssignCourt[];
  slotCount: number;
  clashes: ReadonlySet<string>;
  /** When false every court hosts a single format all night. */
  linked: boolean;
  soft: SoftContext;
  rng: Rng;
  /** DFS node budget before giving up. */
  maxNodes?: number;
  /** Local-search iterations for the soft score. */
  localSearchIterations?: number;
}

export interface Placement {
  key: string;
  slotIndex: number;
  courtId: string;
}

export type AssignFailureCause = 'NO_COURT_FOR_FORMAT' | 'NO_CELL' | 'BUDGET_EXHAUSTED';

export type AssignResult =
  | { ok: true; placements: Placement[]; cost: number; nodes: number }
  | {
      ok: false;
      unplaced: AssignFixture;
      cause: AssignFailureCause;
      reason: string;
      nodes: number;
    };

interface Cell {
  slotIndex: number;
  courtIndex: number;
}

interface SearchState {
  cellUsed: boolean[][]; // [slot][court]
  slotTeams: Array<Set<string>>;
  slotCompetitions: Array<Map<string, number>>;
  courtFormat: Array<string | null>;
  assigned: Map<string, Cell>;
}

function makeState(slotCount: number, courtCount: number): SearchState {
  return {
    cellUsed: Array.from({ length: slotCount }, () => Array<boolean>(courtCount).fill(false)),
    slotTeams: Array.from({ length: slotCount }, () => new Set<string>()),
    slotCompetitions: Array.from({ length: slotCount }, () => new Map<string, number>()),
    courtFormat: Array<string | null>(courtCount).fill(null),
    assigned: new Map(),
  };
}

function slotAllows(
  state: SearchState,
  f: AssignFixture,
  slot: number,
  clashes: ReadonlySet<string>,
): boolean {
  const teams = state.slotTeams[slot] as Set<string>;
  if (teams.has(f.homeTeamId) || teams.has(f.awayTeamId)) return false;
  if (clashes.size === 0) return true;
  for (const other of teams) {
    if (
      clashes.has(clashPairKey(f.homeTeamId, other)) ||
      clashes.has(clashPairKey(f.awayTeamId, other))
    ) {
      return false;
    }
  }
  return true;
}

function courtAllows(
  state: SearchState,
  courts: readonly AssignCourt[],
  f: AssignFixture,
  courtIndex: number,
  linked: boolean,
): boolean {
  const court = courts[courtIndex] as AssignCourt;
  if (!court.supportedFormatIds.includes(f.formatId)) return false;
  if (!linked) {
    const current = state.courtFormat[courtIndex];
    if (current !== null && current !== f.formatId) return false;
  }
  return true;
}

/** Incremental soft cost of placing `f` in `slot` (lower is better). */
function placementCost(
  state: SearchState,
  f: AssignFixture,
  slot: number,
  soft: SoftContext,
): number {
  let cost = 0;
  for (const team of [f.homeTeamId, f.awayTeamId]) {
    const history = soft.slotHistory.get(team);
    const count = history?.[slot] ?? 0;
    cost += count * count;
    if (soft.lastWeekSlot.get(team) === slot) cost += 1;
  }
  const stacked = state.slotCompetitions[slot]?.get(f.competitionId) ?? 0;
  cost += stacked * 2;
  return cost;
}

function place(
  state: SearchState,
  f: AssignFixture,
  cell: Cell,
  linked: boolean,
): { prevFormat: string | null } {
  (state.cellUsed[cell.slotIndex] as boolean[])[cell.courtIndex] = true;
  const teams = state.slotTeams[cell.slotIndex] as Set<string>;
  teams.add(f.homeTeamId);
  teams.add(f.awayTeamId);
  const comps = state.slotCompetitions[cell.slotIndex] as Map<string, number>;
  comps.set(f.competitionId, (comps.get(f.competitionId) ?? 0) + 1);
  const prevFormat = state.courtFormat[cell.courtIndex] ?? null;
  if (!linked) state.courtFormat[cell.courtIndex] = f.formatId;
  state.assigned.set(f.key, cell);
  return { prevFormat };
}

function unplace(
  state: SearchState,
  f: AssignFixture,
  cell: Cell,
  prevFormat: string | null,
  linked: boolean,
): void {
  (state.cellUsed[cell.slotIndex] as boolean[])[cell.courtIndex] = false;
  const teams = state.slotTeams[cell.slotIndex] as Set<string>;
  teams.delete(f.homeTeamId);
  teams.delete(f.awayTeamId);
  const comps = state.slotCompetitions[cell.slotIndex] as Map<string, number>;
  const n = (comps.get(f.competitionId) ?? 1) - 1;
  if (n <= 0) comps.delete(f.competitionId);
  else comps.set(f.competitionId, n);
  if (!linked) {
    // Restore the court's format only if no other fixture on this court still uses it.
    const stillUsed = [...state.assigned.entries()].some(
      ([key, c]) => key !== f.key && c.courtIndex === cell.courtIndex,
    );
    state.courtFormat[cell.courtIndex] = stillUsed
      ? (state.courtFormat[cell.courtIndex] ?? null)
      : prevFormat;
  }
  state.assigned.delete(f.key);
}

function totalCost(
  placements: ReadonlyMap<string, Cell>,
  fixtures: readonly AssignFixture[],
  soft: SoftContext,
): number {
  const stack = new Map<string, number>();
  let cost = 0;
  for (const f of fixtures) {
    const cell = placements.get(f.key);
    if (!cell) continue;
    for (const team of [f.homeTeamId, f.awayTeamId]) {
      const count = soft.slotHistory.get(team)?.[cell.slotIndex] ?? 0;
      cost += count * count;
      if (soft.lastWeekSlot.get(team) === cell.slotIndex) cost += 1;
    }
    const key = `${cell.slotIndex}|${f.competitionId}`;
    const n = stack.get(key) ?? 0;
    cost += n * 2;
    stack.set(key, n + 1);
  }
  return cost;
}

/** Hard-constraint check of a complete assignment (used by local search moves). */
function feasible(
  placements: ReadonlyMap<string, Cell>,
  fixtures: readonly AssignFixture[],
  courts: readonly AssignCourt[],
  clashes: ReadonlySet<string>,
  linked: boolean,
): boolean {
  const cells = new Set<string>();
  const slotTeams = new Map<number, string[]>();
  const courtFormat = new Map<number, string>();
  for (const f of fixtures) {
    const cell = placements.get(f.key);
    if (!cell) return false;
    const cellKey = `${cell.slotIndex}|${cell.courtIndex}`;
    if (cells.has(cellKey)) return false;
    cells.add(cellKey);
    const court = courts[cell.courtIndex] as AssignCourt;
    if (!court.supportedFormatIds.includes(f.formatId)) return false;
    if (!linked) {
      const existing = courtFormat.get(cell.courtIndex);
      if (existing !== undefined && existing !== f.formatId) return false;
      courtFormat.set(cell.courtIndex, f.formatId);
    }
    const teams = slotTeams.get(cell.slotIndex) ?? [];
    for (const team of [f.homeTeamId, f.awayTeamId]) {
      if (teams.includes(team)) return false;
      for (const other of teams) if (clashes.has(clashPairKey(team, other))) return false;
    }
    teams.push(f.homeTeamId, f.awayTeamId);
    slotTeams.set(cell.slotIndex, teams);
  }
  return true;
}

/**
 * Places one night's fixtures into (slot, court) cells. Depth-first search ordered by
 * most-constrained fixture first with a node budget, then bounded local search on the
 * soft score. Deterministic for a given rng.
 */
export function assignNight(input: AssignInput): AssignResult {
  const { fixtures, courts, slotCount, clashes, linked, soft, rng } = input;
  const maxNodes = input.maxNodes ?? 200_000;
  const iterations = input.localSearchIterations ?? 1500;

  const clashDegree = new Map<string, number>();
  for (const key of clashes) {
    const [a, b] = key.split('|') as [string, string];
    clashDegree.set(a, (clashDegree.get(a) ?? 0) + 1);
    clashDegree.set(b, (clashDegree.get(b) ?? 0) + 1);
  }
  const courtOptions = (f: AssignFixture) =>
    courts.filter((c) => c.supportedFormatIds.includes(f.formatId)).length;
  const tightness = (f: AssignFixture) =>
    -(1000 * (courts.length - courtOptions(f))) -
    100 * ((clashDegree.get(f.homeTeamId) ?? 0) + (clashDegree.get(f.awayTeamId) ?? 0));
  const jitter = new Map(fixtures.map((f) => [f.key, rng.next()]));
  const ordered = fixtures.slice().sort((a, b) => {
    const t = tightness(a) - tightness(b);
    if (t !== 0) return t;
    return (jitter.get(a.key) ?? 0) - (jitter.get(b.key) ?? 0);
  });

  for (const f of ordered) {
    if (courtOptions(f) === 0) {
      return {
        ok: false,
        unplaced: f,
        cause: 'NO_COURT_FOR_FORMAT',
        reason: 'No court on this night supports the game format',
        nodes: 0,
      };
    }
  }

  const state = makeState(slotCount, courts.length);
  let nodes = 0;
  const failure: { deepest: { index: number; fixture: AssignFixture } | null } = { deepest: null };

  const search = (index: number): boolean => {
    if (index === ordered.length) return true;
    if (nodes >= maxNodes) return false;
    const f = ordered[index] as AssignFixture;
    const candidates: Array<{ cell: Cell; cost: number; tie: number }> = [];
    for (let slot = 0; slot < slotCount; slot++) {
      if (!slotAllows(state, f, slot, clashes)) continue;
      const cost = placementCost(state, f, slot, soft);
      for (let court = 0; court < courts.length; court++) {
        if ((state.cellUsed[slot] as boolean[])[court]) continue;
        if (!courtAllows(state, courts, f, court, linked)) continue;
        candidates.push({ cell: { slotIndex: slot, courtIndex: court }, cost, tie: rng.next() });
      }
    }
    if (candidates.length === 0) {
      if (!failure.deepest || index > failure.deepest.index)
        failure.deepest = { index, fixture: f };
      return false;
    }
    candidates.sort((a, b) => a.cost - b.cost || a.tie - b.tie);
    for (const candidate of candidates) {
      nodes += 1;
      const { prevFormat } = place(state, f, candidate.cell, linked);
      if (search(index + 1)) return true;
      unplace(state, f, candidate.cell, prevFormat, linked);
      if (nodes >= maxNodes) return false;
    }
    if (!failure.deepest || index > failure.deepest.index) failure.deepest = { index, fixture: f };
    return false;
  };

  if (!search(0)) {
    const unplaced = failure.deepest ? failure.deepest.fixture : (ordered[0] as AssignFixture);
    const budget = nodes >= maxNodes;
    return {
      ok: false,
      unplaced,
      cause: budget ? 'BUDGET_EXHAUSTED' : 'NO_CELL',
      reason: budget
        ? 'Search budget exhausted without finding a valid layout'
        : 'No free cell satisfies the clash, court and format constraints',
      nodes,
    };
  }

  // Local search: try swapping two fixtures' cells or moving one to a free cell.
  let best = new Map(state.assigned);
  let bestCost = totalCost(best, fixtures, soft);
  if (fixtures.length > 1) {
    const allCells: Cell[] = [];
    for (let slot = 0; slot < slotCount; slot++) {
      for (let court = 0; court < courts.length; court++)
        allCells.push({ slotIndex: slot, courtIndex: court });
    }
    for (let i = 0; i < iterations && bestCost > 0; i++) {
      const candidate = new Map(best);
      const a = rng.pick(fixtures);
      if (rng.next() < 0.5) {
        const b = rng.pick(fixtures);
        if (a.key === b.key) continue;
        const ca = candidate.get(a.key) as Cell;
        const cb = candidate.get(b.key) as Cell;
        candidate.set(a.key, cb);
        candidate.set(b.key, ca);
      } else {
        const target = rng.pick(allCells);
        const occupied = [...candidate.values()].some(
          (c) => c.slotIndex === target.slotIndex && c.courtIndex === target.courtIndex,
        );
        if (occupied) continue;
        candidate.set(a.key, target);
      }
      if (!feasible(candidate, fixtures, courts, clashes, linked)) continue;
      const cost = totalCost(candidate, fixtures, soft);
      if (cost <= bestCost) {
        best = candidate;
        bestCost = cost;
      }
    }
  }

  const placements: Placement[] = fixtures.map((f) => {
    const cell = best.get(f.key) as Cell;
    return {
      key: f.key,
      slotIndex: cell.slotIndex,
      courtId: (courts[cell.courtIndex] as AssignCourt).id,
    };
  });
  return { ok: true, placements, cost: bestCost, nodes };
}
