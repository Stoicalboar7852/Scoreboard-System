import { type PrismaClient } from '@prisma/client';

export interface ClashPair {
  teamAId: string;
  teamBId: string;
  source: 'LINK' | 'PLAYER';
  playerName?: string;
}

/** Explicit clash links plus links derived from players rostered in two teams. */
export class ClashService {
  constructor(private readonly db: PrismaClient) {}

  async pairs(): Promise<ClashPair[]> {
    const [links, players] = await Promise.all([
      this.db.teamClashLink.findMany(),
      this.db.player.findMany({ include: { teams: true } }),
    ]);
    const pairs: ClashPair[] = links.map((l) => ({
      teamAId: l.teamAId,
      teamBId: l.teamBId,
      source: 'LINK',
    }));
    const seen = new Set(pairs.map((p) => key(p.teamAId, p.teamBId)));
    for (const player of players) {
      const teamIds = player.teams.map((t) => t.teamId);
      for (let i = 0; i < teamIds.length; i++) {
        for (let j = i + 1; j < teamIds.length; j++) {
          const a = teamIds[i] as string;
          const b = teamIds[j] as string;
          const k = key(a, b);
          if (seen.has(k)) continue;
          seen.add(k);
          pairs.push({ teamAId: a, teamBId: b, source: 'PLAYER', playerName: player.name });
        }
      }
    }
    return pairs;
  }
}

function key(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
