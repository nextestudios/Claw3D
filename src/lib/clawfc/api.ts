import { getClawFCClient } from "./client";
import type {
  ClawFCClub,
  ClawFCLeague,
  ClawFCMatch,
  ClawFCMatchEvent,
  ClawFCMatchEventRow,
  ClawFCMatchEventType,
  ClawFCPlayer,
  ClawFCStanding,
} from "./types";

export async function getClubs(): Promise<ClawFCClub[]> {
  const client = getClawFCClient();
  if (!client) return [];
  const { data, error } = await client.from("clubs").select("*");
  if (error) {
    console.error("[ClawFC] Failed to fetch clubs:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getPlayersByClub(
  clubId: string,
): Promise<ClawFCPlayer[]> {
  const client = getClawFCClient();
  if (!client) return [];
  const { data, error } = await client
    .from("players")
    .select("*")
    .eq("club_id", clubId);
  if (error) {
    console.error("[ClawFC] Failed to fetch players:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getLeagues(): Promise<ClawFCLeague[]> {
  const client = getClawFCClient();
  if (!client) return [];
  const { data, error } = await client.from("leagues").select("*");
  if (error) {
    console.error("[ClawFC] Failed to fetch leagues:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getStandings(
  leagueId: string,
): Promise<ClawFCStanding[]> {
  const client = getClawFCClient();
  if (!client) return [];
  const { data, error } = await client
    .from("standings")
    .select("*")
    .eq("league_id", leagueId)
    .order("points", { ascending: false });
  if (error) {
    console.error("[ClawFC] Failed to fetch standings:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getMatchesByClub(
  clubId: string,
): Promise<ClawFCMatch[]> {
  const client = getClawFCClient();
  if (!client) return [];
  const { data, error } = await client
    .from("matches")
    .select("*")
    .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[ClawFC] Failed to fetch matches:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getMatchById(matchId: string): Promise<ClawFCMatch | null> {
  const client = getClawFCClient();
  if (!client) return null;
  const { data, error } = await client
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();
  if (error) {
    console.error("[ClawFC] Failed to fetch match by id:", error.message);
    return null;
  }
  return data;
}

export async function getLatestMatch(): Promise<ClawFCMatch | null> {
  const client = getClawFCClient();
  if (!client) return null;
  const { data, error } = await client
    .from("matches")
    .select("*")
    .eq("status", "played")
    .order("played_at", { ascending: false })
    .limit(1)
    .single();
  if (error) {
    console.error("[ClawFC] Failed to fetch latest match:", error.message);
    return null;
  }
  return data;
}

/** Fetches a live match if one exists. */
export async function getLiveMatch(): Promise<ClawFCMatch | null> {
  const client = getClawFCClient();
  if (!client) return null;
  const { data, error } = await client
    .from("matches")
    .select("*")
    .eq("status", "live")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[ClawFC] Failed to fetch live match:", error.message);
    return null;
  }
  return data;
}

export async function getLatestFinishedMatch(): Promise<ClawFCMatch | null> {
  const client = getClawFCClient();
  if (!client) return null;
  const { data, error } = await client
    .from("matches")
    .select("*")
    .eq("status", "finished")
    .order("played_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(
      "[ClawFC] Failed to fetch latest finished match:",
      error.message,
    );
    return null;
  }
  return data;
}

/** Fetches raw event rows from the match_events table. */
export async function getMatchEventRows(
  matchId: string,
): Promise<ClawFCMatchEventRow[]> {
  const client = getClawFCClient();
  if (!client) return [];
  const { data, error } = await client
    .from("match_events")
    .select("*")
    .eq("match_id", matchId)
    .order("minute", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[ClawFC] Failed to fetch match events:", error.message);
    return [];
  }
  return data ?? [];
}

const VALID_EVENT_TYPES = new Set<string>([
  "goal",
  "penalty_goal",
  "own_goal",
  "penalty_miss",
  "shot_on_target",
  "shot_off_target",
  "shot_blocked",
  "save",
  "goalkeeper_claim",
  "tackle_won",
  "tackle_lost",
  "interception",
  "clearance",
  "corner",
  "free_kick",
  "throw_in",
  "foul",
  "yellow_card",
  "red_card",
  "offside",
  "ball_possession_change",
  "pass_completed",
  "pass_incomplete",
  "substitution",
]);

/**
 * Converts raw DB event rows into the normalized frontend format.
 * Resolves player UUIDs to names and team UUIDs to home/away.
 */
export function normalizeMatchEventRows(
  rows: ClawFCMatchEventRow[],
  homeClubId: string,
  awayClubId: string,
  playerMap: Map<string, ClawFCPlayer>,
): ClawFCMatchEvent[] {
  return rows
    .filter((row) => VALID_EVENT_TYPES.has(row.event_type))
    .map((row) => {
      const teamClubId = row.team_id ?? row.club_id;
      let team: "home" | "away" | undefined;
      if (teamClubId === homeClubId) team = "home";
      else if (teamClubId === awayClubId) team = "away";

      const player = row.player_id
        ? playerMap.get(row.player_id)
        : undefined;
      const assistPlayer = row.assist_player_id
        ? playerMap.get(row.assist_player_id)
        : undefined;

      const meta = row.metadata ?? {};
      const pos = meta.position as
        | { x: number; y: number }
        | undefined;
      const fromPos = meta.from_position as
        | { x: number; y: number }
        | undefined;
      const toPos = meta.to_position as
        | { x: number; y: number }
        | undefined;
      const recipientId = meta.recipient_id as string | undefined;
      const recipient = recipientId
        ? playerMap.get(recipientId)
        : undefined;

      const evt: ClawFCMatchEvent = {
        type: row.event_type as ClawFCMatchEventType,
        minute: row.minute,
        team,
        player: player?.name,
        club_id: teamClubId ?? undefined,
      };

      if (assistPlayer) {
        evt.assist_name = assistPlayer.name;
        evt.assist_id = row.assist_player_id ?? undefined;
      }
      if (pos) evt.position = pos;
      if (fromPos) evt.fromPosition = fromPos;
      if (toPos) evt.toPosition = toPos;
      if (recipient) evt.recipient = recipient.name;
      if (meta.shot_type) evt.shotType = meta.shot_type as string;
      if (meta.reason)
        evt.possessionChangeReason = meta.reason as string;

      return evt;
    });
}

/**
 * Normalizes a legacy JSONB event that may use engine field names.
 * Handles both our custom format ({type, player, team}) and
 * the engine format ({event_type, player_id, team_id}).
 */
export function normalizeLegacyJsonbEvent(
  raw: Record<string, unknown>,
  homeClubId: string,
  awayClubId: string,
  playerMap: Map<string, ClawFCPlayer>,
): ClawFCMatchEvent | null {
  const eventType = (raw.event_type ?? raw.type) as string | undefined;
  if (!eventType || !VALID_EVENT_TYPES.has(eventType)) return null;

  const minute = raw.minute as number;

  let team: "home" | "away" | undefined;
  if (raw.team === "home" || raw.team === "away") {
    team = raw.team;
  } else {
    const cid = (raw.team_id ?? raw.club_id) as string | undefined;
    if (cid === homeClubId) team = "home";
    else if (cid === awayClubId) team = "away";
  }

  let playerName: string | undefined;
  if (typeof raw.player === "string") {
    playerName = raw.player;
  } else if (typeof raw.player_id === "string") {
    playerName = playerMap.get(raw.player_id)?.name;
  }

  return {
    type: eventType as ClawFCMatchEventType,
    minute,
    team,
    player: playerName,
  };
}
