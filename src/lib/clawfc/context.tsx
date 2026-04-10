"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getClubs,
  getLatestFinishedMatch,
  getLatestMatch,
  getLiveMatch,
  getMatchById,
  getMatchesByClub,
  getMatchEventRows,
  getPlayersByClub,
  getStandings,
  normalizeLegacyJsonbEvent,
  normalizeMatchEventRows,
} from "./api";
import { getClawFCClient, isClawFCConfigured } from "./client";
import type {
  ClawFCClub,
  ClawFCMatch,
  ClawFCMatchContext,
  ClawFCPlayer,
  ClawFCStanding,
} from "./types";

interface ClawFCState {
  configured: boolean;
  loading: boolean;
  clubs: ClawFCClub[];
  standings: ClawFCStanding[];
  selectedClubId: string | null;
  /** Currently displayed match with hydrated club/player data. */
  matchContext: ClawFCMatchContext | null;
  /** Select a match to display in the stadium. */
  selectMatch: (match: ClawFCMatch) => void;
  /** Select a club to show their latest match. */
  selectClub: (clubId: string) => void;
  /** Refresh all data from ClawFC. */
  refresh: () => void;
}

const ClawFCContext = createContext<ClawFCState>({
  configured: false,
  loading: false,
  clubs: [],
  standings: [],
  selectedClubId: null,
  matchContext: null,
  selectMatch: () => {},
  selectClub: () => {},
  refresh: () => {},
});

export const useClawFC = () => useContext(ClawFCContext);

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function ClawFCProvider({ children }: { children: ReactNode }) {
  const configured = useMemo(() => isClawFCConfigured(), []);
  const [loading, setLoading] = useState(false);
  const [clubs, setClubs] = useState<ClawFCClub[]>([]);
  const [standings, setStandings] = useState<ClawFCStanding[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [matchContext, setMatchContext] = useState<ClawFCMatchContext | null>(
    null,
  );
  const clubMapRef = useRef<Map<string, ClawFCClub>>(new Map());
  const matchIdRef = useRef<string | null>(null);

  const choosePreferredMatch = useCallback((matches: ClawFCMatch[]) => {
    const live = matches.find((m) => m.status === "live");
    if (live) return live;

    const scheduled = matches
      .filter((m) => m.status === "scheduled")
      .sort((a, b) => {
        const at = a.scheduled_at ?? a.played_at ?? "";
        const bt = b.scheduled_at ?? b.played_at ?? "";
        return at.localeCompare(bt);
      })[0];
    if (scheduled) return scheduled;

    const played = matches.find(
      (m) => m.status === "played" || m.status === "finished",
    );
    return played ?? null;
  }, []);

  const hydrateMatch = useCallback(
    async (match: ClawFCMatch, clubMap: Map<string, ClawFCClub>) => {
      const homeClub = clubMap.get(match.home_club_id);
      const awayClub = clubMap.get(match.away_club_id);
      if (!homeClub || !awayClub) return null;

      const [homePlayers, awayPlayers, eventRows] = await Promise.all([
        getPlayersByClub(match.home_club_id),
        getPlayersByClub(match.away_club_id),
        getMatchEventRows(match.id),
      ]);

      const playerMap = new Map<string, ClawFCPlayer>();
      for (const p of [...homePlayers, ...awayPlayers]) {
        playerMap.set(p.id, p);
      }

      let events = match.events;
      if (eventRows.length > 0) {
        events = normalizeMatchEventRows(
          eventRows,
          match.home_club_id,
          match.away_club_id,
          playerMap,
        );
      } else if (Array.isArray(events) && events.length > 0) {
        const first = events[0] as unknown as Record<string, unknown>;
        if ("event_type" in first && !("type" in first)) {
          events = (events as unknown as Record<string, unknown>[])
            .map((raw) =>
              normalizeLegacyJsonbEvent(
                raw,
                match.home_club_id,
                match.away_club_id,
                playerMap,
              ),
            )
            .filter(Boolean) as typeof events;
        }
      } else {
        events = [];
      }

      const hydratedMatch = { ...match, events };
      return {
        match: hydratedMatch,
        homeClub,
        awayClub,
        homePlayers,
        awayPlayers,
      };
    },
    [],
  );

  const applyMatchContext = useCallback(
    async (match: ClawFCMatch, clubMap: Map<string, ClawFCClub>) => {
      const ctx = await hydrateMatch(match, clubMap);
      if (!ctx) return;
      setMatchContext(ctx);
      matchIdRef.current = match.id;
      setSelectedClubId((prev) => prev ?? ctx.homeClub.id);
      const nextStandings = await getStandings(match.league_id);
      setStandings(nextStandings);
    },
    [hydrateMatch],
  );

  const loadInitialData = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    try {
      const [fetchedClubs, liveMatch, latestMatch, latestFinished] =
        await Promise.all([
          getClubs(),
          getLiveMatch(),
          getLatestMatch(),
          getLatestFinishedMatch(),
        ]);
      setClubs(fetchedClubs);

      const nextClubMap = new Map(fetchedClubs.map((c) => [c.id, c]));
      clubMapRef.current = nextClubMap;

      const firstMatch = liveMatch ?? latestMatch ?? latestFinished;
      if (firstMatch) {
        await applyMatchContext(firstMatch, nextClubMap);
      }
    } catch (err) {
      console.error("[ClawFC] Failed to load initial data:", err);
    } finally {
      setLoading(false);
    }
  }, [applyMatchContext, configured]);

  useEffect(() => {
    loadInitialData();
    if (!configured) return;
    const interval = setInterval(loadInitialData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [configured, loadInitialData]);

  const selectMatch = useCallback(
    async (match: ClawFCMatch) => {
      await applyMatchContext(match, clubMapRef.current);
    },
    [applyMatchContext],
  );

  const selectClub = useCallback(
    async (clubId: string) => {
      try {
        const matches = await getMatchesByClub(clubId);
        setSelectedClubId(clubId);
        const preferred = choosePreferredMatch(matches);
        if (preferred) {
          await applyMatchContext(preferred, clubMapRef.current);
        }
      } catch (err) {
        console.error("[ClawFC] Failed to select club:", err);
      }
    },
    [applyMatchContext, choosePreferredMatch],
  );

  useEffect(() => {
    if (!configured) return;
    const client = getClawFCClient();
    const matchId = matchIdRef.current;
    if (!client || !matchId) return;

    const matchChannel = client
      .channel(`clawfc-match-${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matches",
          filter: `id=eq.${matchId}`,
        },
        async () => {
          const refreshedMatch = await getMatchById(matchId);
          if (!refreshedMatch) return;
          await applyMatchContext(refreshedMatch, clubMapRef.current);
        },
      )
      .subscribe();

    const eventsChannel = client
      .channel(`clawfc-match-events-${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "match_events",
          filter: `match_id=eq.${matchId}`,
        },
        async () => {
          const refreshedMatch = await getMatchById(matchId);
          if (!refreshedMatch) return;
          await applyMatchContext(refreshedMatch, clubMapRef.current);
        },
      )
      .subscribe();

    const clubsChannel = client
      .channel("clawfc-clubs-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "clubs",
        },
        async (payload) => {
          const nextClub = payload.new as ClawFCClub;
          setClubs((prev) =>
            prev.map((club) => (club.id === nextClub.id ? nextClub : club)),
          );
          const previous = clubMapRef.current.get(nextClub.id);
          clubMapRef.current.set(nextClub.id, nextClub);

          if (
            previous?.stadium_level !== nextClub.stadium_level &&
            matchIdRef.current
          ) {
            const refreshedMatch = await getMatchById(matchIdRef.current);
            if (!refreshedMatch) return;
            await applyMatchContext(refreshedMatch, clubMapRef.current);
          }
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(matchChannel);
      client.removeChannel(eventsChannel);
      client.removeChannel(clubsChannel);
    };
  }, [applyMatchContext, configured, matchContext?.match.id]);

  const value = useMemo<ClawFCState>(
    () => ({
      configured,
      loading,
      clubs,
      standings,
      selectedClubId,
      matchContext,
      selectMatch,
      selectClub,
      refresh: loadInitialData,
    }),
    [
      configured,
      loading,
      clubs,
      standings,
      selectedClubId,
      matchContext,
      selectMatch,
      selectClub,
      loadInitialData,
    ],
  );

  return (
    <ClawFCContext.Provider value={value}>{children}</ClawFCContext.Provider>
  );
}
