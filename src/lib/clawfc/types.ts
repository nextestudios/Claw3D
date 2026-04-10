export interface ClawFCClub {
  id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  stadium_level: string;
  city_id: string | null;
}

export interface ClawFCPlayer {
  id: string;
  name: string;
  agent_id?: string;
  club_id: string | null;
  position: "goalkeeper" | "defender" | "midfielder" | "forward";
  speed: number;
  technique: number;
  stamina: number;
  is_dummy?: boolean;
}

export type ClawFCMatchEventType =
  | "goal"
  | "penalty_goal"
  | "own_goal"
  | "penalty_miss"
  | "shot_on_target"
  | "shot_off_target"
  | "shot_blocked"
  | "save"
  | "goalkeeper_claim"
  | "tackle_won"
  | "tackle_lost"
  | "interception"
  | "clearance"
  | "corner"
  | "free_kick"
  | "throw_in"
  | "foul"
  | "yellow_card"
  | "red_card"
  | "offside"
  | "ball_possession_change"
  | "pass_completed"
  | "pass_incomplete"
  | "substitution";

/** Normalized match event used by the frontend. */
export interface ClawFCMatchEvent {
  type: ClawFCMatchEventType;
  minute: number;
  player?: string;
  club?: string;
  club_id?: string;
  scorer_id?: string;
  scorer_name?: string;
  assist_id?: string;
  assist_name?: string;
  team?: "home" | "away";
  /** Normalized position (0-1 range) from the engine. */
  position?: { x: number; y: number };
  /** For pass events: origin and destination positions. */
  fromPosition?: { x: number; y: number };
  toPosition?: { x: number; y: number };
  /** For pass events: recipient player name. */
  recipient?: string;
  /** Shot type from engine metadata (e.g. "right_foot", "header"). */
  shotType?: string;
  /** Possession change reason from engine metadata. */
  possessionChangeReason?: string;
}

/** Raw event row from the match_events database table. */
export interface ClawFCMatchEventRow {
  id: string;
  match_id: string;
  minute: number;
  event_type: string;
  player_id: string | null;
  assist_player_id: string | null;
  club_id: string | null;
  team_id: string | null;
  description: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface ClawFCMatch {
  id: string;
  league_id: string;
  home_club_id: string;
  away_club_id: string;
  home_goals: number;
  away_goals: number;
  events: ClawFCMatchEvent[];
  status: "scheduled" | "live" | "played" | "finished";
  match_report: string | null;
  played_at: string | null;
  scheduled_at: string | null;
  matchweek: number | null;
  motm_player_id: string | null;
}

export interface ClawFCStanding {
  id: string;
  league_id: string;
  club_id: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  points: number;
  goal_difference: number;
  position_status: string | null;
}

export interface ClawFCLeague {
  id: string;
  name: string;
  display_name: string;
  country: string;
  tier: number;
  season: number;
  status: string;
}

export interface ClawFCCountry {
  id: string;
  name: string;
  continent: string;
  flag_emoji: string;
  status: string;
  description: string;
  capital_city: string;
}

export interface ClawFCCity {
  id: string;
  name: string;
  country_id: string;
  lore: string | null;
}

/** Resolved match data with clubs and players hydrated. */
export interface ClawFCMatchContext {
  match: ClawFCMatch;
  homeClub: ClawFCClub;
  awayClub: ClawFCClub;
  homePlayers: ClawFCPlayer[];
  awayPlayers: ClawFCPlayer[];
}
