"use client";

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  DollarSign,
  Gauge,
  MapPin,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Shield,
  TrendingUp,
  X,
  Zap,
  Target,
  GitCompareArrows,
  Lightbulb,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ApiError,
  apiFetch,
} from "@/lib/api";

/* ============================================================
   TYPES
============================================================ */

type RouteRecord = {
  route_id: number;
  route_code: string;

  source_location_id: number;
  source_city: string;
  source_state: string;

  destination_location_id: number;
  destination_city: string;
  destination_state: string;

  distance_km: number;
  estimated_time_hours: number;
  base_cost: number;

  route_status: string;
  risk_score: number;

  created_at: string | null;
};

type RoutesResponse = {
  system?: string;
  module?: string;
  count?: number;
  routes?: RouteRecord[];
  timestamp?: string;
};

type SortMode =
  | "risk"
  | "distance"
  | "time"
  | "cost"
  | "route";

type Recommendation = {
  route: RouteRecord;
  decisionScore: number;
  riskReduction: number;
  timeDifference: number;
  costDifference: number;
  reason: string;
};

/* ============================================================
   BASIC HELPERS
============================================================ */

function numberValue(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return parsed;
}

function formatNumber(
  value: number,
  digits = 0
): string {
  return numberValue(value).toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatCurrency(value: number): string {
  return `₹${formatNumber(value, 0)}`;
}

function riskLabel(score: number): string {
  const value = numberValue(score);

  if (value >= 75) {
    return "CRITICAL";
  }

  if (value >= 50) {
    return "HIGH";
  }

  if (value >= 25) {
    return "MEDIUM";
  }

  return "LOW";
}

function riskClass(score: number): string {
  const level = riskLabel(score);

  if (level === "CRITICAL") {
    return "border-red-500/30 bg-red-500/10 text-red-400";
  }

  if (level === "HIGH") {
    return "border-orange-500/30 bg-orange-500/10 text-orange-400";
  }

  if (level === "MEDIUM") {
    return "border-yellow-500/30 bg-yellow-500/10 text-yellow-400";
  }

  return "border-cyan-500/30 bg-cyan-500/10 text-cyan-400";
}

function riskBarClass(score: number): string {
  const value = numberValue(score);

  if (value >= 75) {
    return "bg-red-400";
  }

  if (value >= 50) {
    return "bg-orange-400";
  }

  if (value >= 25) {
    return "bg-yellow-400";
  }

  return "bg-cyan-400";
}

function statusClass(status: string): string {
  const normalized = String(
    status || ""
  ).toUpperCase();

  if (normalized === "OPEN") {
    return "border-cyan-500/25 bg-cyan-500/10 text-cyan-300";
  }

  if (
    normalized.includes("CLOSED") ||
    normalized.includes("BLOCK") ||
    normalized.includes("UNAVAILABLE")
  ) {
    return "border-red-500/25 bg-red-500/10 text-red-300";
  }

  return "border-slate-500/25 bg-slate-500/10 text-slate-300";
}

function displayText(
  value: string | null | undefined
): string {
  if (!value) {
    return "UNKNOWN";
  }

  return value;
}

/* ============================================================
   NORMALIZATION HELPERS
============================================================ */

function sameCorridor(
  a: RouteRecord,
  b: RouteRecord
): boolean {
  const sameLocationIds =
    a.source_location_id ===
      b.source_location_id &&
    a.destination_location_id ===
      b.destination_location_id;

  const sameCities =
    String(a.source_city)
      .toLowerCase()
      .trim() ===
      String(b.source_city)
        .toLowerCase()
        .trim() &&
    String(a.destination_city)
      .toLowerCase()
      .trim() ===
      String(b.destination_city)
        .toLowerCase()
        .trim();

  return sameLocationIds || sameCities;
}

function minMax(
  values: number[]
): {
  min: number;
  max: number;
} {
  if (values.length === 0) {
    return {
      min: 0,
      max: 1,
    };
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function normalize(
  value: number,
  min: number,
  max: number
): number {
  if (max === min) {
    return 0;
  }

  return (value - min) / (max - min);
}

/* ============================================================
   ROUTE DECISION SCORE
============================================================ */

/*
  Lower score = better route.

  Decision weighting:
  - Risk      65%
  - Time      20%
  - Cost      15%

  This is intentionally a transparent decision-support
  heuristic using the route data already returned by the API.
*/

function calculateDecisionScore(
  route: RouteRecord,
  candidates: RouteRecord[]
): number {
  const riskValues = candidates.map((item) =>
    numberValue(item.risk_score)
  );

  const timeValues = candidates.map((item) =>
    numberValue(item.estimated_time_hours)
  );

  const costValues = candidates.map((item) =>
    numberValue(item.base_cost)
  );

  const riskRange = minMax(riskValues);
  const timeRange = minMax(timeValues);
  const costRange = minMax(costValues);

  const riskNormalized = normalize(
    numberValue(route.risk_score),
    riskRange.min,
    riskRange.max
  );

  const timeNormalized = normalize(
    numberValue(route.estimated_time_hours),
    timeRange.min,
    timeRange.max
  );

  const costNormalized = normalize(
    numberValue(route.base_cost),
    costRange.min,
    costRange.max
  );

  return (
    riskNormalized * 0.65 +
    timeNormalized * 0.2 +
    costNormalized * 0.15
  );
}

/* ============================================================
   MAIN PAGE
============================================================ */

export default function RouteIntelligencePage() {
  const [routes, setRoutes] =
    useState<RouteRecord[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("ALL");

  const [riskFilter, setRiskFilter] =
    useState("ALL");

  const [sortMode, setSortMode] =
    useState<SortMode>("risk");

  const [selectedRoute, setSelectedRoute] =
    useState<RouteRecord | null>(null);

  const [lastUpdated, setLastUpdated] =
    useState<string | null>(null);

  /* ==========================================================
     LOAD ROUTES
  ========================================================== */

  const loadRoutes = useCallback(
    async (manual = false) => {
      try {
        if (manual) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const data = await apiFetch<RoutesResponse>(
          "/api/v1/routes?limit=120"
        );

        const loadedRoutes =
          Array.isArray(data.routes)
            ? data.routes
            : [];

        setRoutes(loadedRoutes);

        setLastUpdated(
          data.timestamp ||
            new Date().toISOString()
        );
      } catch (err) {
        console.error(
          "Route Intelligence API error:",
          err
        );

        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to connect to Route Intelligence API."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    loadRoutes(false);
  }, [loadRoutes]);

  /* ==========================================================
     NETWORK STATISTICS
  ========================================================== */

  const statistics = useMemo(() => {
    const total = routes.length;

    const open = routes.filter(
      (route) =>
        String(
          route.route_status
        ).toUpperCase() === "OPEN"
    ).length;

    const unavailable =
      total - open;

    const averageRisk =
      total > 0
        ? routes.reduce(
            (sum, route) =>
              sum +
              numberValue(
                route.risk_score
              ),
            0
          ) / total
        : 0;

    const averageDistance =
      total > 0
        ? routes.reduce(
            (sum, route) =>
              sum +
              numberValue(
                route.distance_km
              ),
            0
          ) / total
        : 0;

    const critical =
      routes.filter(
        (route) =>
          numberValue(
            route.risk_score
          ) >= 75
      ).length;

    const high =
      routes.filter(
        (route) =>
          numberValue(
            route.risk_score
          ) >= 50 &&
          numberValue(
            route.risk_score
          ) < 75
      ).length;

    const medium =
      routes.filter(
        (route) =>
          numberValue(
            route.risk_score
          ) >= 25 &&
          numberValue(
            route.risk_score
          ) < 50
      ).length;

    const low =
      routes.filter(
        (route) =>
          numberValue(
            route.risk_score
          ) < 25
      ).length;

    return {
      total,
      open,
      unavailable,
      averageRisk,
      averageDistance,
      critical,
      high,
      medium,
      low,
    };
  }, [routes]);

  /* ==========================================================
     FILTERED ROUTES
  ========================================================== */

  const filteredRoutes = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    const filtered = routes.filter(
      (route) => {
        const matchesSearch =
          !query ||
          [
            route.route_code,
            route.source_city,
            route.source_state,
            route.destination_city,
            route.destination_state,
            route.route_status,
          ]
            .filter(Boolean)
            .some((value) =>
              String(value)
                .toLowerCase()
                .includes(query)
            );

        const matchesStatus =
          statusFilter === "ALL" ||
          String(
            route.route_status
          ).toUpperCase() ===
            statusFilter;

        const risk =
          numberValue(
            route.risk_score
          );

        let matchesRisk = true;

        if (
          riskFilter ===
          "CRITICAL"
        ) {
          matchesRisk =
            risk >= 75;
        }

        if (
          riskFilter === "HIGH"
        ) {
          matchesRisk =
            risk >= 50 &&
            risk < 75;
        }

        if (
          riskFilter === "MEDIUM"
        ) {
          matchesRisk =
            risk >= 25 &&
            risk < 50;
        }

        if (
          riskFilter === "LOW"
        ) {
          matchesRisk =
            risk < 25;
        }

        return (
          matchesSearch &&
          matchesStatus &&
          matchesRisk
        );
      }
    );

    return [...filtered].sort(
      (a, b) => {
        if (
          sortMode === "risk"
        ) {
          return (
            numberValue(
              b.risk_score
            ) -
            numberValue(
              a.risk_score
            )
          );
        }

        if (
          sortMode ===
          "distance"
        ) {
          return (
            numberValue(
              b.distance_km
            ) -
            numberValue(
              a.distance_km
            )
          );
        }

        if (
          sortMode === "time"
        ) {
          return (
            numberValue(
              b.estimated_time_hours
            ) -
            numberValue(
              a.estimated_time_hours
            )
          );
        }

        if (
          sortMode === "cost"
        ) {
          return (
            numberValue(
              b.base_cost
            ) -
            numberValue(
              a.base_cost
            )
          );
        }

        return String(
          a.route_code
        ).localeCompare(
          String(b.route_code)
        );
      }
    );
  }, [
    routes,
    search,
    statusFilter,
    riskFilter,
    sortMode,
  ]);

  /* ==========================================================
     TOP RISK ROUTES
  ========================================================== */

  const topRiskRoutes =
    useMemo(() => {
      return [...routes]
        .sort(
          (a, b) =>
            numberValue(
              b.risk_score
            ) -
            numberValue(
              a.risk_score
            )
        )
        .slice(0, 5);
    }, [routes]);

  /* ==========================================================
     ROUTE ALTERNATIVES
  ========================================================== */

  const routeAlternatives =
    useMemo(() => {
      if (!selectedRoute) {
        return [];
      }

      const sameCorridorRoutes =
        routes.filter(
          (route) =>
            route.route_id !==
              selectedRoute.route_id &&
            sameCorridor(
              selectedRoute,
              route
            ) &&
            String(
              route.route_status
            ).toUpperCase() ===
              "OPEN"
        );

      return sameCorridorRoutes
        .map((route) => ({
          route,
          decisionScore:
            calculateDecisionScore(
              route,
              [
                selectedRoute,
                ...sameCorridorRoutes,
              ]
            ),
        }))
        .sort(
          (a, b) =>
            a.decisionScore -
            b.decisionScore
        );
    }, [
      routes,
      selectedRoute,
    ]);

  /* ==========================================================
     RECOMMENDATION
  ========================================================== */

  const recommendation =
    useMemo<Recommendation | null>(
      () => {
        if (
          !selectedRoute ||
          routeAlternatives.length === 0
        ) {
          return null;
        }

        const best =
          routeAlternatives[0];

        const route =
          best.route;

        const currentRisk =
          numberValue(
            selectedRoute.risk_score
          );

        const newRisk =
          numberValue(
            route.risk_score
          );

        const riskReduction =
          currentRisk > 0
            ? ((currentRisk -
                newRisk) /
                currentRisk) *
              100
            : 0;

        const timeDifference =
          numberValue(
            route.estimated_time_hours
          ) -
          numberValue(
            selectedRoute.estimated_time_hours
          );

        const costDifference =
          numberValue(
            route.base_cost
          ) -
          numberValue(
            selectedRoute.base_cost
          );

        let reason =
          "This route provides the best combined risk, time and cost score among the available alternatives.";

        if (
          riskReduction >= 30
        ) {
          reason =
            "Strong risk reduction detected. This alternative materially lowers route exposure while remaining operationally available.";
        } else if (
          riskReduction > 0
        ) {
          reason =
            "Lower route risk detected. The alternative provides a safer corridor with a manageable operational trade-off.";
        } else if (
          timeDifference < 0
        ) {
          reason =
            "This alternative improves travel time while remaining competitive on operational risk.";
        } else {
          reason =
            "This alternative has the strongest overall decision score across risk, travel time and cost.";
        }

        return {
          route,
          decisionScore:
            best.decisionScore,
          riskReduction,
          timeDifference,
          costDifference,
          reason,
        };
      },
      [
        selectedRoute,
        routeAlternatives,
      ]
    );

  /* ==========================================================
     CLEAR FILTERS
  ========================================================== */

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("ALL");
    setRiskFilter("ALL");
    setSortMode("risk");
  };

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <main className="min-h-screen bg-[#05080b] text-white">
      {/* ======================================================
          HEADER
      ====================================================== */}

      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#05080b]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4 lg:px-8">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() =>
                window.history.back()
              }
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-slate-300 transition hover:border-cyan-400/30 hover:text-white"
              aria-label="Go back"
            >
              <ArrowLeft size={20} />
            </button>

            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.32em] text-cyan-400">
                LogiShield · Network Intelligence
              </div>

              <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
                Route Intelligence
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] px-4 py-2.5 md:flex">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-50" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400" />
              </span>

              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-300">
                Route Engine Live
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                loadRoutes(true)
              }
              disabled={refreshing}
              className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-2.5 text-sm text-slate-300 transition hover:border-cyan-400/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />

              <span className="hidden sm:inline">
                Refresh
              </span>
            </button>

            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-400 text-xs font-black text-[#061014]">
              LS
            </div>
          </div>
        </div>
      </header>

      {/* ======================================================
          CONTENT
      ====================================================== */}

      <div className="mx-auto max-w-[1600px] px-6 py-8 lg:px-8">
        {/* ====================================================
            HERO
        ==================================================== */}

        <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#0b1116] via-[#080d11] to-[#0a1114] p-7 lg:p-9">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/[0.05] blur-3xl" />

          <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-4xl">
              <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-400">
                <Navigation size={13} />
                Network topology & route exposure
              </div>

              <h2 className="text-3xl font-semibold tracking-tight text-white lg:text-4xl">
                Find safer routes before disruption becomes a delay.
              </h2>

              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 lg:text-base">
                LogiShield evaluates route availability,
                distance, travel time, cost and operational
                risk to identify vulnerable corridors and
                recommend safer alternatives.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <HeroPill
                  icon={<Shield size={13} />}
                  label="Risk-aware routing"
                />

                <HeroPill
                  icon={<GitCompareArrows size={13} />}
                  label="Alternative comparison"
                />

                <HeroPill
                  icon={<Target size={13} />}
                  label="Decision scoring"
                />
              </div>
            </div>

            <div className="hidden h-28 w-28 shrink-0 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/[0.03] lg:flex">
              <div className="flex flex-col items-center gap-2">
                <RouteIcon
                  size={28}
                  className="text-cyan-400"
                />

                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-300">
                  Active
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ====================================================
            ERROR
        ==================================================== */}

        {error && (
          <section className="mt-5 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-5 py-4">
            <AlertTriangle
              size={18}
              className="mt-0.5 shrink-0 text-red-400"
            />

            <div>
              <p className="text-sm font-medium text-red-300">
                Unable to connect to Route Intelligence API.
              </p>

              <p className="mt-1 text-xs text-red-400/70">
                {error}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                loadRoutes(true)
              }
              className="ml-auto shrink-0 rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/10"
            >
              Retry
            </button>
          </section>
        )}

        {/* ====================================================
            KPI CARDS
        ==================================================== */}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            icon={<RouteIcon size={20} />}
            label="Network Routes"
            value={
              loading ||
              (error &&
                routes.length === 0)
                ? "—"
                : formatNumber(
                    statistics.total
                  )
            }
            caption="Routes monitored by engine"
            iconClass="bg-cyan-400/[0.08] text-cyan-400"
          />

          <StatCard
            icon={<CheckCircle2 size={20} />}
            label="Open Routes"
            value={
              loading ||
              (error &&
                routes.length === 0)
                ? "—"
                : formatNumber(
                    statistics.open
                  )
            }
            caption="Currently available corridors"
            iconClass="bg-cyan-400/[0.08] text-cyan-400"
          />

          <StatCard
            icon={<Shield size={20} />}
            label="Average Route Risk"
            value={
              loading ||
              (error &&
                routes.length === 0)
                ? "—"
                : `${formatNumber(
                    statistics.averageRisk,
                    1
                  )}%`
            }
            caption="Network-wide route risk"
            iconClass="bg-orange-400/[0.08] text-orange-400"
            danger={
              routes.length > 0 &&
              statistics.averageRisk >=
                50
            }
          />

          <StatCard
            icon={<MapPin size={20} />}
            label="Average Distance"
            value={
              loading ||
              (error &&
                routes.length === 0)
                ? "—"
                : `${formatNumber(
                    statistics.averageDistance,
                    0
                  )} km`
            }
            caption="Average corridor length"
            iconClass="bg-cyan-400/[0.08] text-cyan-400"
          />

          <StatCard
            icon={<AlertTriangle size={20} />}
            label="Critical Routes"
            value={
              loading ||
              (error &&
                routes.length === 0)
                ? "—"
                : formatNumber(
                    statistics.critical
                  )
            }
            caption="Immediate route attention"
            iconClass="bg-red-400/[0.08] text-red-400"
            danger={
              routes.length > 0 &&
              statistics.critical > 0
            }
          />
        </section>

        {/* ====================================================
            MAIN GRID
        ==================================================== */}

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* ==================================================
              ROUTE REGISTRY
          ================================================== */}

          <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#070c10]">
            <div className="border-b border-white/[0.07] p-5 lg:p-6">
              <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-400">
                    Route Registry
                  </div>

                  <h3 className="mt-2 text-xl font-semibold">
                    Live network corridors
                  </h3>

                  <p className="mt-1 text-xs text-slate-500">
                    {filteredRoutes.length} of{" "}
                    {routes.length} routes shown
                  </p>
                </div>

                <div className="relative w-full lg:w-80">
                  <Search
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                  />

                  <input
                    value={search}
                    onChange={(event) =>
                      setSearch(
                        event.target.value
                      )
                    }
                    placeholder="Search route, city or state..."
                    className="w-full rounded-xl border border-white/[0.08] bg-black/20 py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-600 transition focus:border-cyan-400/30"
                  />
                </div>
              </div>

              {/* FILTERS */}

              <div className="mt-5 flex flex-wrap gap-2">
                <FilterButton
                  active={
                    statusFilter ===
                    "ALL"
                  }
                  onClick={() =>
                    setStatusFilter(
                      "ALL"
                    )
                  }
                >
                  All
                </FilterButton>

                <FilterButton
                  active={
                    statusFilter ===
                    "OPEN"
                  }
                  onClick={() =>
                    setStatusFilter(
                      "OPEN"
                    )
                  }
                >
                  Open
                </FilterButton>

                <FilterButton
                  active={
                    statusFilter ===
                    "CLOSED"
                  }
                  onClick={() =>
                    setStatusFilter(
                      "CLOSED"
                    )
                  }
                >
                  Closed
                </FilterButton>

                <div className="mx-1 hidden h-8 w-px bg-white/[0.08] sm:block" />

                <FilterButton
                  active={
                    riskFilter ===
                    "CRITICAL"
                  }
                  onClick={() =>
                    setRiskFilter(
                      riskFilter ===
                        "CRITICAL"
                        ? "ALL"
                        : "CRITICAL"
                    )
                  }
                >
                  Critical
                </FilterButton>

                <FilterButton
                  active={
                    riskFilter ===
                    "HIGH"
                  }
                  onClick={() =>
                    setRiskFilter(
                      riskFilter ===
                        "HIGH"
                        ? "ALL"
                        : "HIGH"
                    )
                  }
                >
                  High Risk
                </FilterButton>

                <FilterButton
                  active={
                    riskFilter ===
                    "MEDIUM"
                  }
                  onClick={() =>
                    setRiskFilter(
                      riskFilter ===
                        "MEDIUM"
                        ? "ALL"
                        : "MEDIUM"
                    )
                  }
                >
                  Medium
                </FilterButton>

                <div className="ml-auto flex items-center gap-2">
                  <div className="relative">
                    <select
                      value={
                        sortMode
                      }
                      onChange={(event) =>
                        setSortMode(
                          event
                            .target
                            .value as SortMode
                        )
                      }
                      className="appearance-none rounded-lg border border-white/[0.08] bg-[#0a1015] py-2 pl-3 pr-8 text-xs text-slate-300 outline-none"
                    >
                      <option value="risk">
                        Sort: Risk
                      </option>

                      <option value="distance">
                        Sort: Distance
                      </option>

                      <option value="time">
                        Sort: Travel Time
                      </option>

                      <option value="cost">
                        Sort: Cost
                      </option>

                      <option value="route">
                        Sort: Route Code
                      </option>
                    </select>

                    <ChevronDown
                      size={13}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500"
                    />
                  </div>

                  {(search ||
                    statusFilter !==
                      "ALL" ||
                    riskFilter !==
                      "ALL") && (
                    <button
                      type="button"
                      onClick={
                        clearFilters
                      }
                      className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-slate-400 transition hover:text-white"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* TABLE */}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left">
                    <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                      Route
                    </th>

                    <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                      Corridor
                    </th>

                    <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                      Distance
                    </th>

                    <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                      Travel
                    </th>

                    <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                      Cost
                    </th>

                    <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                      Risk
                    </th>

                    <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                      Status
                    </th>

                    <th className="px-5 py-4 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                      Inspect
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    Array.from({
                      length: 7,
                    }).map(
                      (_, index) => (
                        <tr
                          key={
                            index
                          }
                          className="border-b border-white/[0.04]"
                        >
                          {Array.from({
                            length: 8,
                          }).map(
                            (
                              _,
                              cell
                            ) => (
                              <td
                                key={
                                  cell
                                }
                                className="px-5 py-5"
                              >
                                <div className="h-4 animate-pulse rounded bg-white/[0.04]" />
                              </td>
                            )
                          )}
                        </tr>
                      )
                    )
                  ) : filteredRoutes.length ===
                    0 ? (
                    <tr>
                      <td
                        colSpan={
                          8
                        }
                        className="px-5 py-16 text-center"
                      >
                        <RouteIcon
                          size={
                            28
                          }
                          className="mx-auto text-slate-700"
                        />

                        <p className="mt-3 text-sm text-slate-400">
                          No routes match the current filters.
                        </p>

                        <button
                          type="button"
                          onClick={
                            clearFilters
                          }
                          className="mt-4 rounded-lg border border-white/[0.08] px-4 py-2 text-xs text-slate-300 hover:text-white"
                        >
                          Clear filters
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filteredRoutes.map(
                      (
                        route
                      ) => {
                        const risk =
                          numberValue(
                            route.risk_score
                          );

                        return (
                          <tr
                            key={
                              route.route_id
                            }
                            className="group border-b border-white/[0.04] transition hover:bg-white/[0.025]"
                          >
                            <td className="px-5 py-5">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400/[0.07] text-cyan-400">
                                  <RouteIcon
                                    size={
                                      16
                                    }
                                  />
                                </div>

                                <div>
                                  <div className="font-mono text-sm font-semibold text-white">
                                    {
                                      route.route_code
                                    }
                                  </div>

                                  <div className="mt-1 text-[10px] text-slate-600">
                                    ID #
                                    {
                                      route.route_id
                                    }
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="px-5 py-5">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="font-medium text-slate-200">
                                  {
                                    route.source_city
                                  }
                                </span>

                                <ArrowRight
                                  size={
                                    14
                                  }
                                  className="text-slate-600"
                                />

                                <span className="font-medium text-slate-200">
                                  {
                                    route.destination_city
                                  }
                                </span>
                              </div>

                              <div className="mt-1 text-[10px] text-slate-600">
                                {
                                  route.source_state
                                }{" "}
                                →{" "}
                                {
                                  route.destination_state
                                }
                              </div>
                            </td>

                            <td className="px-5 py-5">
                              <div className="text-sm font-medium text-slate-200">
                                {formatNumber(
                                  route.distance_km,
                                  0
                                )}{" "}
                                km
                              </div>
                            </td>

                            <td className="px-5 py-5">
                              <div className="flex items-center gap-2 text-sm text-slate-300">
                                <Clock3
                                  size={
                                    14
                                  }
                                  className="text-slate-600"
                                />

                                {formatNumber(
                                  route.estimated_time_hours,
                                  1
                                )}
                                h
                              </div>
                            </td>

                            <td className="px-5 py-5">
                              <div className="text-sm font-medium text-slate-200">
                                {formatCurrency(
                                  route.base_cost
                                )}
                              </div>
                            </td>

                            <td className="px-5 py-5">
                              <div className="w-28">
                                <div className="mb-2 flex items-center justify-between">
                                  <span
                                    className={`text-xs font-bold ${
                                      risk >=
                                      75
                                        ? "text-red-400"
                                        : risk >=
                                          50
                                        ? "text-orange-400"
                                        : risk >=
                                          25
                                        ? "text-yellow-400"
                                        : "text-cyan-400"
                                    }`}
                                  >
                                    {formatNumber(
                                      risk,
                                      1
                                    )}
                                  </span>

                                  <span className="text-[9px] text-slate-700">
                                    /100
                                  </span>
                                </div>

                                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                                  <div
                                    className={`h-full rounded-full ${riskBarClass(
                                      risk
                                    )}`}
                                    style={{
                                      width: `${Math.min(
                                        100,
                                        Math.max(
                                          0,
                                          risk
                                        )
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </td>

                            <td className="px-5 py-5">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] ${statusClass(
                                  route.route_status
                                )}`}
                              >
                                {
                                  route.route_status
                                }
                              </span>
                            </td>

                            <td className="px-5 py-5 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedRoute(
                                    route
                                  )
                                }
                                className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-cyan-400/25 hover:bg-cyan-400/[0.04] hover:text-cyan-300"
                              >
                                Inspect
                              </button>
                            </td>
                          </tr>
                        );
                      }
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ==================================================
              RIGHT SIDEBAR
          ================================================== */}

          <aside className="space-y-6">
            {/* RISK DISTRIBUTION */}

            <div className="rounded-2xl border border-white/[0.08] bg-[#070c10] p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-orange-400">
                    Route Risk
                  </div>

                  <h3 className="mt-2 text-lg font-semibold">
                    Risk distribution
                  </h3>
                </div>

                <Gauge
                  size={21}
                  className="text-orange-400"
                />
              </div>

              <div className="mt-6 space-y-5">
                <RiskDistributionRow
                  label="Critical"
                  count={
                    statistics.critical
                  }
                  total={
                    statistics.total
                  }
                  valueClass="text-red-400"
                  barClass="bg-red-400"
                />

                <RiskDistributionRow
                  label="High"
                  count={
                    statistics.high
                  }
                  total={
                    statistics.total
                  }
                  valueClass="text-orange-400"
                  barClass="bg-orange-400"
                />

                <RiskDistributionRow
                  label="Medium"
                  count={
                    statistics.medium
                  }
                  total={
                    statistics.total
                  }
                  valueClass="text-yellow-400"
                  barClass="bg-yellow-400"
                />

                <RiskDistributionRow
                  label="Low"
                  count={
                    statistics.low
                  }
                  total={
                    statistics.total
                  }
                  valueClass="text-cyan-400"
                  barClass="bg-cyan-400"
                />
              </div>
            </div>

            {/* TOP RISK ROUTES */}

            <div className="rounded-2xl border border-white/[0.08] bg-[#070c10] p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-400">
                    Exposure Watch
                  </div>

                  <h3 className="mt-2 text-lg font-semibold">
                    Highest-risk routes
                  </h3>
                </div>

                <AlertTriangle
                  size={21}
                  className="text-red-400"
                />
              </div>

              <div className="mt-5 space-y-3">
                {topRiskRoutes.length ===
                0 ? (
                  <p className="text-sm text-slate-600">
                    No route data available.
                  </p>
                ) : (
                  topRiskRoutes.map(
                    (
                      route,
                      index
                    ) => (
                      <button
                        type="button"
                        key={
                          route.route_id
                        }
                        onClick={() =>
                          setSelectedRoute(
                            route
                          )
                        }
                        className="w-full rounded-xl border border-white/[0.05] bg-white/[0.015] p-3 text-left transition hover:border-cyan-400/20 hover:bg-white/[0.03]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-xs font-bold text-slate-500">
                            {String(
                              index +
                                1
                            ).padStart(
                              2,
                              "0"
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate font-mono text-xs font-semibold text-white">
                                {
                                  route.route_code
                                }
                              </span>

                              <span
                                className={`text-xs font-bold ${riskTextColor(
                                  route.risk_score
                                )}`}
                              >
                                {formatNumber(
                                  route.risk_score,
                                  1
                                )}
                              </span>
                            </div>

                            <div className="mt-1 truncate text-[10px] text-slate-600">
                              {
                                route.source_city
                              }{" "}
                              →{" "}
                              {
                                route.destination_city
                              }
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  )
                )}
              </div>
            </div>

            {/* DECISION ENGINE INFO */}

            <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.025] p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/[0.08] text-cyan-400">
                  <Target size={19} />
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
                    Route Decision Engine
                  </div>

                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Alternative routes are compared using
                    a transparent decision score weighted toward
                    route risk, followed by travel time and cost.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <WeightBox
                  label="Risk"
                  value="65%"
                />

                <WeightBox
                  label="Time"
                  value="20%"
                />

                <WeightBox
                  label="Cost"
                  value="15%"
                />
              </div>

              {lastUpdated && (
                <div className="mt-5 border-t border-white/[0.06] pt-4 text-[10px] text-slate-600">
                  Last synchronization:{" "}
                  {new Date(
                    lastUpdated
                  ).toLocaleString(
                    "en-IN"
                  )}
                </div>
              )}
            </div>
          </aside>
        </section>

        {/* ====================================================
            NETWORK SIGNALS
        ==================================================== */}

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <SignalCard
            icon={
              <TrendingUp
                size={18}
              />
            }
            label="Critical Exposure"
            value={formatNumber(
              statistics.critical
            )}
            description="Routes requiring immediate operational review"
            className="text-red-400"
          />

          <SignalCard
            icon={
              <Zap size={18} />
            }
            label="High Priority"
            value={formatNumber(
              statistics.high
            )}
            description="Routes that should be monitored closely"
            className="text-orange-400"
          />

          <SignalCard
            icon={
              <Navigation
                size={18}
              />
            }
            label="Available Network"
            value={
              statistics.total >
              0
                ? `${formatNumber(
                    (statistics.open /
                      statistics.total) *
                      100,
                    1
                  )}%`
                : "0%"
            }
            description="Share of routes currently marked OPEN"
            className="text-cyan-400"
          />
        </section>
      </div>

      {/* ======================================================
          ROUTE DETAIL DRAWER
      ====================================================== */}

      {selectedRoute && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          onClick={() =>
            setSelectedRoute(null)
          }
        >
          <div
            className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-white/[0.08] bg-[#070b0f] shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            {/* DRAWER HEADER */}

            <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/[0.07] bg-[#070b0f]/95 px-6 py-5 backdrop-blur-xl">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-400">
                  Route Inspection
                </div>

                <h2 className="mt-1 font-mono text-lg font-semibold">
                  {
                    selectedRoute.route_code
                  }
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedRoute(
                    null
                  )
                }
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-slate-400 transition hover:text-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-6 p-6">
              {/* ==================================================
                  CORRIDOR
              ================================================== */}

              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
                <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
                  <Navigation
                    size={13}
                  />
                  Current Corridor
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs text-slate-500">
                      Origin
                    </div>

                    <div className="mt-1 text-lg font-semibold">
                      {
                        selectedRoute.source_city
                      }
                    </div>

                    <div className="text-xs text-slate-600">
                      {
                        selectedRoute.source_state
                      }
                    </div>
                  </div>

                  <div className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/[0.05] text-cyan-400">
                    <ArrowRight
                      size={19}
                    />
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-slate-500">
                      Destination
                    </div>

                    <div className="mt-1 text-lg font-semibold">
                      {
                        selectedRoute.destination_city
                      }
                    </div>

                    <div className="text-xs text-slate-600">
                      {
                        selectedRoute.destination_state
                      }
                    </div>
                  </div>
                </div>
              </div>

              {/* ==================================================
                  CURRENT RISK
              ================================================== */}

              <div
                className={`rounded-2xl border p-5 ${riskClass(
                  selectedRoute.risk_score
                )}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">
                      Current Route Risk
                    </div>

                    <div className="mt-2 text-4xl font-semibold">
                      {formatNumber(
                        selectedRoute.risk_score,
                        1
                      )}
                    </div>
                  </div>

                  <span className="rounded-full border border-current px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em]">
                    {riskLabel(
                      selectedRoute.risk_score
                    )}
                  </span>
                </div>

                <div className="mt-5 h-2 overflow-hidden rounded-full bg-black/20">
                  <div
                    className={`h-full rounded-full ${riskBarClass(
                      selectedRoute.risk_score
                    )}`}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          numberValue(
                            selectedRoute.risk_score
                          )
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* ==================================================
                  METRICS
              ================================================== */}

              <div className="grid grid-cols-2 gap-3">
                <DetailMetric
                  icon={
                    <MapPin
                      size={17}
                    />
                  }
                  label="Distance"
                  value={`${formatNumber(
                    selectedRoute.distance_km,
                    1
                  )} km`}
                />

                <DetailMetric
                  icon={
                    <Clock3
                      size={17}
                    />
                  }
                  label="Estimated Time"
                  value={`${formatNumber(
                    selectedRoute.estimated_time_hours,
                    1
                  )} hours`}
                />

                <DetailMetric
                  icon={
                    <DollarSign
                      size={17}
                    />
                  }
                  label="Base Cost"
                  value={formatCurrency(
                    selectedRoute.base_cost
                  )}
                />

                <DetailMetric
                  icon={
                    <CheckCircle2
                      size={17}
                    />
                  }
                  label="Status"
                  value={displayText(
                    selectedRoute.route_status
                  )}
                />
              </div>

              {/* ==================================================
                  ROUTE RECOMMENDATION
              ================================================== */}

              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.035] p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/[0.08] text-cyan-400">
                    <Lightbulb
                      size={19}
                    />
                  </div>

                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
                      Route Recommendation
                    </div>

                    <h3 className="mt-2 text-lg font-semibold">
                      Safer alternative analysis
                    </h3>

                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      The engine compares available routes
                      sharing this corridor using risk,
                      travel time and cost.
                    </p>
                  </div>
                </div>

                {routeAlternatives.length ===
                0 ? (
                  <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle
                        size={17}
                        className="mt-0.5 text-orange-400"
                      />

                      <div>
                        <p className="text-xs font-medium text-orange-300">
                          No alternative route found
                        </p>

                        <p className="mt-1 text-[10px] leading-5 text-slate-600">
                          No other OPEN route with the same origin
                          and destination was returned by the Route API.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* RECOMMENDED */}

                    {recommendation && (
                      <div className="mt-5 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Target
                              size={16}
                              className="text-cyan-400"
                            />

                            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">
                              Recommended Route
                            </span>
                          </div>

                          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-cyan-300">
                            Best Score
                          </span>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-4">
                          <div>
                            <div className="font-mono text-lg font-semibold text-white">
                              {
                                recommendation
                                  .route
                                  .route_code
                              }
                            </div>

                            <div className="mt-1 text-xs text-slate-500">
                              {
                                recommendation
                                  .route
                                  .source_city
                              }{" "}
                              →{" "}
                              {
                                recommendation
                                  .route
                                  .destination_city
                              }
                            </div>
                          </div>

                          <div className="text-right">
                            <div
                              className={`text-2xl font-bold ${riskTextColor(
                                recommendation
                                  .route
                                  .risk_score
                              )}`}
                            >
                              {formatNumber(
                                recommendation
                                  .route
                                  .risk_score,
                                1
                              )}
                            </div>

                            <div className="text-[9px] uppercase tracking-[0.12em] text-slate-600">
                              route risk
                            </div>
                          </div>
                        </div>

                        <p className="mt-4 text-xs leading-6 text-slate-400">
                          {
                            recommendation.reason
                          }
                        </p>

                        <div className="mt-5 grid grid-cols-2 gap-3">
                          <ComparisonMetric
                            label="Risk Reduction"
                            value={
                              recommendation.riskReduction >
                              0
                                ? `-${formatNumber(
                                    recommendation.riskReduction,
                                    1
                                  )}%`
                                : "0%"
                            }
                            positive={
                              recommendation.riskReduction >
                              0
                            }
                          />

                          <ComparisonMetric
                            label="Decision Score"
                            value={formatNumber(
                              recommendation.decisionScore *
                                100,
                              1
                            )}
                          />

                          <ComparisonMetric
                            label="Time Change"
                            value={
                              recommendation.timeDifference >
                              0
                                ? `+${formatNumber(
                                    recommendation.timeDifference,
                                    1
                                  )}h`
                                : `${formatNumber(
                                    recommendation.timeDifference,
                                    1
                                  )}h`
                            }
                            positive={
                              recommendation.timeDifference <=
                              0
                            }
                          />

                          <ComparisonMetric
                            label="Cost Change"
                            value={
                              recommendation.costDifference >
                              0
                                ? `+${formatCurrency(
                                    recommendation.costDifference
                                  )}`
                                : recommendation.costDifference <
                                  0
                                ? `-${formatCurrency(
                                    Math.abs(
                                      recommendation.costDifference
                                    )
                                  )}`
                                : "₹0"
                            }
                            positive={
                              recommendation.costDifference <=
                              0
                            }
                          />
                        </div>
                      </div>
                    )}

                    {/* ALTERNATIVE LIST */}

                    <div className="mt-5">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                          Alternative Routes
                        </span>

                        <span className="text-[9px] text-slate-700">
                          {
                            routeAlternatives.length
                          } available
                        </span>
                      </div>

                      <div className="space-y-2">
                        {routeAlternatives
                          .slice(0, 5)
                          .map(
                            (
                              item,
                              index
                            ) => {
                              const route =
                                item.route;

                              const riskReduction =
                                numberValue(
                                  selectedRoute.risk_score
                                ) >
                                0
                                  ? ((numberValue(
                                      selectedRoute.risk_score
                                    ) -
                                      numberValue(
                                        route.risk_score
                                      )) /
                                      numberValue(
                                        selectedRoute.risk_score
                                      )) *
                                    100
                                  : 0;

                              return (
                                <div
                                  key={
                                    route.route_id
                                  }
                                  className={`rounded-xl border p-4 ${
                                    index ===
                                    0
                                      ? "border-cyan-400/15 bg-cyan-400/[0.025]"
                                      : "border-white/[0.05] bg-white/[0.015]"
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-[10px] font-bold text-slate-500">
                                      {String(
                                        index +
                                          1
                                      ).padStart(
                                        2,
                                        "0"
                                      )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="font-mono text-xs font-semibold text-white">
                                          {
                                            route.route_code
                                          }
                                        </span>

                                        <span
                                          className={`text-sm font-bold ${riskTextColor(
                                            route.risk_score
                                          )}`}
                                        >
                                          {formatNumber(
                                            route.risk_score,
                                            1
                                          )}
                                        </span>
                                      </div>

                                      <div className="mt-1 text-[9px] text-slate-600">
                                        Decision score{" "}
                                        {formatNumber(
                                          item.decisionScore *
                                            100,
                                          1
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-4 grid grid-cols-3 gap-2">
                                    <SmallComparison
                                      label="Risk"
                                      value={riskLabel(
                                        route.risk_score
                                      )}
                                    />

                                    <SmallComparison
                                      label="Time"
                                      value={`${formatNumber(
                                        route.estimated_time_hours,
                                        1
                                      )}h`}
                                    />

                                    <SmallComparison
                                      label="Cost"
                                      value={formatCurrency(
                                        route.base_cost
                                      )}
                                    />
                                  </div>

                                  {riskReduction >
                                    0 && (
                                    <div className="mt-3 text-[9px] font-medium text-cyan-400">
                                      {formatNumber(
                                        riskReduction,
                                        1
                                      )}
                                      % lower risk than current route
                                    </div>
                                  )}
                                </div>
                              );
                            }
                          )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* ==================================================
                  OPERATIONAL GUIDANCE
              ================================================== */}

              <div className="rounded-2xl border border-orange-500/15 bg-orange-500/[0.025] p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-400/[0.08] text-orange-400">
                    <Shield size={18} />
                  </div>

                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400">
                      Operational Guidance
                    </div>

                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      {numberValue(
                        selectedRoute.risk_score
                      ) >= 75
                        ? "Critical route exposure detected. Evaluate the recommended alternative before assigning additional shipments to this corridor."
                        : numberValue(
                              selectedRoute.risk_score
                            ) >= 50
                        ? "High route exposure detected. Monitor this corridor closely and keep the recommended alternative available."
                        : numberValue(
                              selectedRoute.risk_score
                            ) >= 25
                        ? "Moderate route exposure detected. Continue monitoring route conditions and compare alternatives when disruption signals increase."
                        : "Route currently shows low modeled risk. Continue normal operational monitoring."}
                    </p>
                  </div>
                </div>
              </div>

              {/* ==================================================
                  ROUTE METADATA
              ================================================== */}

              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02]">
                <div className="border-b border-white/[0.06] px-5 py-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                    Route Metadata
                  </div>
                </div>

                <div className="divide-y divide-white/[0.05]">
                  <InfoRow
                    label="Route ID"
                    value={`#${selectedRoute.route_id}`}
                  />

                  <InfoRow
                    label="Route Code"
                    value={
                      selectedRoute.route_code
                    }
                    mono
                  />

                  <InfoRow
                    label="Source Location ID"
                    value={`#${selectedRoute.source_location_id}`}
                  />

                  <InfoRow
                    label="Destination Location ID"
                    value={`#${selectedRoute.destination_location_id}`}
                  />

                  <InfoRow
                    label="Created At"
                    value={
                      selectedRoute.created_at
                        ? new Date(
                            selectedRoute.created_at
                          ).toLocaleString(
                            "en-IN"
                          )
                        : "UNKNOWN"
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ============================================================
   STAT CARD
============================================================ */

function StatCard({
  icon,
  label,
  value,
  caption,
  iconClass,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  caption: string;
  iconClass: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-[#070c10] p-5 transition ${
        danger
          ? "border-red-500/20"
          : "border-white/[0.08]"
      }`}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}
      >
        {icon}
      </div>

      <div className="mt-6 text-2xl font-semibold tracking-tight">
        {value}
      </div>

      <div className="mt-1 text-xs font-medium text-slate-300">
        {label}
      </div>

      <div className="mt-2 text-[10px] text-slate-600">
        {caption}
      </div>
    </div>
  );
}

/* ============================================================
   FILTER BUTTON
============================================================ */

function FilterButton({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
        active
          ? "border-cyan-400/25 bg-cyan-400/[0.07] text-cyan-300"
          : "border-white/[0.07] bg-white/[0.015] text-slate-500 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

/* ============================================================
   RISK DISTRIBUTION
============================================================ */

function RiskDistributionRow({
  label,
  count,
  total,
  valueClass,
  barClass,
}: {
  label: string;
  count: number;
  total: number;
  valueClass: string;
  barClass: string;
}) {
  const percentage =
    total > 0
      ? (count / total) * 100
      : 0;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {label}
        </span>

        <span
          className={`text-xs font-bold ${valueClass}`}
        >
          {formatNumber(count)}
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{
            width: `${Math.min(
              100,
              percentage
            )}%`,
          }}
        />
      </div>
    </div>
  );
}

/* ============================================================
   SIGNAL CARD
============================================================ */

function SignalCard({
  icon,
  label,
  value,
  description,
  className,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  description: string;
  className: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#070c10] p-5">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] ${className}`}
      >
        {icon}
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500">
            {label}
          </div>

          <div
            className={`mt-1 text-2xl font-semibold ${className}`}
          >
            {value}
          </div>
        </div>

        <Activity
          size={18}
          className="text-slate-700"
        />
      </div>

      <p className="mt-3 text-[10px] leading-5 text-slate-600">
        {description}
      </p>
    </div>
  );
}

/* ============================================================
   DETAIL METRIC
============================================================ */

function DetailMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400/[0.06] text-cyan-400">
        {icon}
      </div>

      <div className="mt-4 text-[10px] uppercase tracking-[0.15em] text-slate-600">
        {label}
      </div>

      <div className="mt-1 text-sm font-semibold text-white">
        {value}
      </div>
    </div>
  );
}

/* ============================================================
   INFO ROW
============================================================ */

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-5 px-5 py-3.5">
      <span className="text-xs text-slate-600">
        {label}
      </span>

      <span
        className={`text-right text-xs text-slate-300 ${
          mono
            ? "font-mono"
            : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/* ============================================================
   HERO PILL
============================================================ */

function HeroPill({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
      <span className="text-cyan-400">
        {icon}
      </span>

      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
    </div>
  );
}

/* ============================================================
   WEIGHT BOX
============================================================ */

function WeightBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3 text-center">
      <div className="text-[9px] uppercase tracking-[0.12em] text-slate-600">
        {label}
      </div>

      <div className="mt-1 text-sm font-bold text-cyan-300">
        {value}
      </div>
    </div>
  );
}

/* ============================================================
   COMPARISON METRIC
============================================================ */

function ComparisonMetric({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3">
      <div className="text-[9px] uppercase tracking-[0.12em] text-slate-600">
        {label}
      </div>

      <div
        className={`mt-1 text-sm font-semibold ${
          positive
            ? "text-cyan-300"
            : "text-slate-300"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/* ============================================================
   SMALL COMPARISON
============================================================ */

function SmallComparison({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-black/10 p-2.5">
      <div className="text-[8px] uppercase tracking-[0.1em] text-slate-700">
        {label}
      </div>

      <div className="mt-1 text-[10px] font-semibold text-slate-300">
        {value}
      </div>
    </div>
  );
}

/* ============================================================
   RISK TEXT COLOR
============================================================ */

function riskTextColor(
  score: number
): string {
  const value =
    numberValue(score);

  if (value >= 75) {
    return "text-red-400";
  }

  if (value >= 50) {
    return "text-orange-400";
  }

  if (value >= 25) {
    return "text-yellow-400";
  }

  return "text-cyan-400";
}