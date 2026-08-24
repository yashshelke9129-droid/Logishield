"use client";

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Car,
  CheckCircle2,
  CloudRain,
  Gauge,
  GitBranch,
  RefreshCw,
  Route as RouteIcon,
  Shield,
  Target,
  Truck,
  X,
  Zap,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { apiFetch } from "@/lib/api";

/* ============================================================
   CONFIGURATION
   ============================================================ */

// All API requests go through apiFetch() in @/lib/api, which
// resolves NEXT_PUBLIC_API_URL (production) or the local
// development server. No hard-coded URLs here.

/* ============================================================
   TYPES
   ============================================================ */

type Shipment = {
  shipment_id?: number;
  shipment_code?: string;
  source_location_id?: number;
  destination_location_id?: number;
  weight_kg?: number;
  current_vehicle_id?: number;
  current_route_id?: number;
};

type RiskData = {
  delay_probability?: number;
  delay_probability_percentage?: number;
  intervention?: string;
  weather?: string;
  traffic?: string;
  active_disruptions?: number;
  maximum_disruption_severity?: number;
  operational_risk?: number;
};

type CurrentRoute = {
  route_id?: number;
  route_code?: string;
  distance_km?: number;
  estimated_time_hours?: number;
  base_cost?: number;
  risk_score?: number;
  status?: string;
};

type RouteSegment = {
  segment?: number;
  route_id?: number;
  route_code?: string;
  source_location_id?: number;
  destination_location_id?: number;
  distance_km?: number;
  estimated_time_hours?: number;
  base_cost?: number;
  base_risk?: number;
  operational_risk?: number;
};

type RecoveryPath = {
  strategy?: string;
  path?: number[];
  route_segments?: RouteSegment[];
  metrics?: {
    segment_count?: number;
    distance_km?: number;
    estimated_time_hours?: number;
    base_cost?: number;
    average_risk?: number;
    maximum_risk?: number;
    path_score?: number;
  };
  destination_reached?: boolean;
};

type AlternativeVehicle = {
  vehicle_id?: number;
  vehicle_type?: string;
  capacity_kg?: number;
  fuel_efficiency_km_per_litre?: number;
  status?: string;
  utilization_percentage?: number;
  vehicle_score?: number;
};

type RecommendedRecovery = {
  strategy?: string;
  route_strategy?: string;
  route_path?: number[];
  route_segments?: RouteSegment[];
  vehicle_id?: number;
  vehicle_type?: string;
  utilization_percentage?: number;
  recovery_score?: number;
  distance_km?: number;
  estimated_time_hours?: number;
  base_cost?: number;
  average_risk?: number;
  maximum_risk?: number;
  destination_reached?: boolean;
  reason?: string;
};

type RecoveryResponse = {
  system?: string;
  engine?: string;
  version?: string;
  optimization?: string;
  shipment?: Shipment;
  risk?: RiskData;
  current_route?: CurrentRoute;
  recovery_paths?: RecoveryPath[];
  alternative_vehicles?: AlternativeVehicle[];
  recommended_recovery?: RecommendedRecovery;
  explanation?: string[];
  network_statistics?: {
    total_open_routes?: number;
    valid_recovery_paths?: number;
    available_vehicles?: number;
  };
  option_count?: number;
};

/* ============================================================
   HELPERS
============================================================ */

function num(value: unknown): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function text(
  value: unknown,
  fallback = "N/A"
): string {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return fallback;
  }

  return String(value);
}

function formatNumber(
  value: unknown,
  digits = 0
): string {
  return num(value).toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatCurrency(
  value: unknown
): string {
  return `₹${formatNumber(value, 0)}`;
}

function formatStrategy(
  strategy: unknown
): string {
  return text(strategy, "N/A")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function riskLabel(
  value: unknown
): string {
  const risk = num(value);

  if (risk >= 75) return "CRITICAL";
  if (risk >= 50) return "HIGH";
  if (risk >= 25) return "MEDIUM";

  return "LOW";
}

function riskText(
  value: unknown
): string {
  const risk = num(value);

  if (risk >= 75) return "text-red-400";
  if (risk >= 50) return "text-orange-400";
  if (risk >= 25) return "text-yellow-400";

  return "text-cyan-400";
}

function riskBorder(
  value: unknown
): string {
  const risk = num(value);

  if (risk >= 75) {
    return "border-red-500/20 bg-red-500/[0.045]";
  }

  if (risk >= 50) {
    return "border-orange-500/20 bg-orange-500/[0.045]";
  }

  if (risk >= 25) {
    return "border-yellow-500/20 bg-yellow-500/[0.045]";
  }

  return "border-cyan-500/20 bg-cyan-500/[0.045]";
}

function riskBar(
  value: unknown
): string {
  const risk = num(value);

  if (risk >= 75) return "bg-red-400";
  if (risk >= 50) return "bg-orange-400";
  if (risk >= 25) return "bg-yellow-400";

  return "bg-cyan-400";
}

/* ============================================================
   PAGE
============================================================ */

export default function RecoveryIntelligencePage() {
  const [shipmentId, setShipmentId] =
    useState("86415");

  const [data, setData] =
    useState<RecoveryResponse | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [vehicleDrawer, setVehicleDrawer] =
    useState(false);

  /* ==========================================================
     LOAD API
  ========================================================== */

  const loadRecovery = useCallback(
    async (
      id: string,
      manual = false
    ) => {
      const parsedId = Number(id);

      if (
        !Number.isInteger(parsedId) ||
        parsedId <= 0
      ) {
        setError(
          "Please enter a valid shipment ID."
        );

        return;
      }

      try {
        if (manual) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const json = await apiFetch<RecoveryResponse>(
          `/api/v1/recovery/shipment/${parsedId}`
        );

        setData(json);
      } catch (err) {
        console.error(
          "Recovery Intelligence API error:",
          err
        );

        setData(null);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load recovery analysis."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    loadRecovery(
      shipmentId,
      false
    );
  }, [
    loadRecovery,
    shipmentId,
  ]);

  /* ==========================================================
     SAFE DATA
  ========================================================== */

  const shipment =
    data?.shipment ?? {};

  const risk =
    data?.risk ?? {};

  const currentRoute =
    data?.current_route ?? {};

  const recommendation =
    data?.recommended_recovery ?? {};

  /*
   * IMPORTANT:
   * Every array is normalized here.
   * This prevents undefined.map() runtime errors.
   */

  const safeRoutePath: number[] =
    Array.isArray(
      recommendation.route_path
    )
      ? recommendation.route_path
      : [];

  const safeRecoveryPaths: RecoveryPath[] =
    Array.isArray(
      data?.recovery_paths
    )
      ? data!.recovery_paths!
      : [];

  const safeVehicles: AlternativeVehicle[] =
    Array.isArray(
      data?.alternative_vehicles
    )
      ? data!.alternative_vehicles!
      : [];

  const safeExplanation: string[] =
    Array.isArray(
      data?.explanation
    )
      ? data!.explanation!
      : [];

  const selectedPath =
    safeRecoveryPaths.length > 0
      ? safeRecoveryPaths[0]
      : null;

  const safeSelectedSegments: RouteSegment[] =
    Array.isArray(
      selectedPath?.route_segments
    )
      ? selectedPath!.route_segments!
      : [];

  const selectedMetrics =
    selectedPath?.metrics ?? {};

  /* ==========================================================
     DERIVED VALUES
  ========================================================== */

  const riskReduction = useMemo(() => {
    const current = num(
      currentRoute.risk_score
    );

    const recovery = num(
      recommendation.average_risk
    );

    if (current <= 0) {
      return 0;
    }

    return (
      ((current - recovery) /
        current) *
      100
    );
  }, [
    currentRoute.risk_score,
    recommendation.average_risk,
  ]);

  const routeRiskDifference =
    useMemo(() => {
      return (
        num(
          currentRoute.risk_score
        ) -
        num(
          recommendation.average_risk
        )
      );
    }, [
      currentRoute.risk_score,
      recommendation.average_risk,
    ]);

  const timeDifference =
    useMemo(() => {
      return (
        num(
          recommendation.estimated_time_hours
        ) -
        num(
          currentRoute.estimated_time_hours
        )
      );
    }, [
      recommendation.estimated_time_hours,
      currentRoute.estimated_time_hours,
    ]);

  const costDifference =
    useMemo(() => {
      return (
        num(
          recommendation.base_cost
        ) -
        num(
          currentRoute.base_cost
        )
      );
    }, [
      recommendation.base_cost,
      currentRoute.base_cost,
    ]);

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
            >
              <ArrowLeft size={19} />
            </button>

            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-400">
                LogiShield · Decision Intelligence
              </div>

              <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
                Recovery Intelligence
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] px-4 py-2.5 md:flex">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-50" />

                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400" />
              </span>

              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-cyan-300">
                Recovery Engine Live
              </span>
            </div>

            <button
              type="button"
              disabled={refreshing}
              onClick={() =>
                loadRecovery(
                  shipmentId,
                  true
                )
              }
              className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-2.5 text-sm text-slate-300 transition hover:border-cyan-400/25 hover:text-white disabled:opacity-50"
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
          MAIN
      ====================================================== */}

      <div className="mx-auto max-w-[1600px] px-6 py-8 lg:px-8">
        {/* ====================================================
            HERO
        ==================================================== */}

        <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#0b1116] via-[#080d11] to-[#0a1114] p-7 lg:p-9">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-400/[0.05] blur-3xl" />

          <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-4xl">
              <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-400">
                <Target size={13} />
                Recovery Decision Engine
              </div>

              <h2 className="text-3xl font-semibold tracking-tight lg:text-4xl">
                Turn disruption signals into an operational recovery decision.
              </h2>

              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 lg:text-base">
                LogiShield combines shipment risk,
                route optimization and vehicle
                availability to determine the best
                recovery strategy for a disrupted shipment.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <EnginePill
                  icon={<Gauge size={13} />}
                  label="ML Risk"
                />

                <EnginePill
                  icon={<GitBranch size={13} />}
                  label="Route Optimization"
                />

                <EnginePill
                  icon={<Truck size={13} />}
                  label="Vehicle Analysis"
                />

                <EnginePill
                  icon={<Shield size={13} />}
                  label="Recovery Plan"
                />
              </div>
            </div>

            <div className="hidden h-28 w-28 shrink-0 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/[0.03] lg:flex">
              <Target
                size={35}
                className="text-cyan-400"
              />
            </div>
          </div>
        </section>

        {/* ====================================================
            SHIPMENT SEARCH
        ==================================================== */}

        <section className="mt-5 rounded-2xl border border-white/[0.08] bg-[#070c10] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
                Shipment Analysis
              </div>

              <p className="mt-2 text-xs text-slate-600">
                Analyze any shipment through the live
                Recovery Decision Engine.
              </p>
            </div>

            <div className="flex w-full gap-2 lg:w-auto">
              <input
                type="number"
                min="1"
                value={shipmentId}
                onChange={(event) =>
                  setShipmentId(
                    event.target.value
                  )
                }
                onKeyDown={(event) => {
                  if (
                    event.key ===
                    "Enter"
                  ) {
                    loadRecovery(
                      shipmentId,
                      true
                    );
                  }
                }}
                placeholder="Shipment ID"
                className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-700 focus:border-cyan-400/30 lg:w-64"
              />

              <button
                type="button"
                onClick={() =>
                  loadRecovery(
                    shipmentId,
                    true
                  )
                }
                className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-[#061014] transition hover:bg-cyan-300"
              >
                Analyze
              </button>
            </div>
          </div>
        </section>

        {/* ====================================================
            ERROR
        ==================================================== */}

        {error && (
          <section className="mt-5 rounded-xl border border-red-500/20 bg-red-500/[0.04] p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle
                size={18}
                className="mt-0.5 text-red-400"
              />

              <div>
                <div className="text-sm font-medium text-red-300">
                  Recovery analysis failed
                </div>

                <div className="mt-1 text-xs text-red-400/70">
                  {error}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ====================================================
            LOADING
        ==================================================== */}

        {loading && (
          <section className="mt-6 space-y-5">
            <LoadingBlock height="h-40" />

            <div className="grid gap-5 lg:grid-cols-3">
              <LoadingBlock height="h-32" />
              <LoadingBlock height="h-32" />
              <LoadingBlock height="h-32" />
            </div>

            <LoadingBlock height="h-72" />
          </section>
        )}

        {/* ====================================================
            DATA
        ==================================================== */}

        {!loading && data && (
          <>
            {/* ==================================================
                CRITICAL DECISION
            ================================================== */}

            <section className="mt-6 overflow-hidden rounded-2xl border border-red-500/20 bg-gradient-to-r from-red-500/[0.07] via-orange-500/[0.035] to-transparent">
              <div className="p-6 lg:p-7">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-400/[0.08] text-red-400">
                      <AlertTriangle
                        size={23}
                      />
                    </div>

                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-400">
                        {formatStrategy(
                          risk.intervention
                        )}
                      </div>

                      <h2 className="mt-2 text-2xl font-semibold">
                        {text(
                          shipment.shipment_code
                        )}
                      </h2>

                      <p className="mt-2 text-sm text-slate-500">
                        Shipment has elevated predicted
                        delay risk and requires active
                        recovery intervention.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <DecisionBadge
                      label="Delay Probability"
                      value={`${formatNumber(
                        risk.delay_probability_percentage,
                        2
                      )}%`}
                      className="text-red-400"
                    />

                    <DecisionBadge
                      label="Operational Risk"
                      value={formatNumber(
                        risk.operational_risk,
                        1
                      )}
                      className="text-orange-400"
                    />

                    <DecisionBadge
                      label="Recovery Options"
                      value={formatNumber(
                        data.option_count
                      )}
                      className="text-cyan-400"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* ==================================================
                KPI GRID
            ================================================== */}

            <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                icon={<Gauge size={19} />}
                label="Delay Probability"
                value={`${formatNumber(
                  risk.delay_probability_percentage,
                  2
                )}%`}
                caption="ML predicted delay risk"
                className="text-red-400"
              />

              <MetricCard
                icon={<Shield size={19} />}
                label="Operational Risk"
                value={formatNumber(
                  risk.operational_risk,
                  1
                )}
                caption="Operational exposure score"
                className="text-orange-400"
              />

              <MetricCard
                icon={<Zap size={19} />}
                label="Disruptions"
                value={formatNumber(
                  risk.active_disruptions
                )}
                caption={`Maximum severity ${formatNumber(
                  risk.maximum_disruption_severity
                )}`}
                className="text-orange-400"
              />

              <MetricCard
                icon={<RouteIcon size={19} />}
                label="Recovery Paths"
                value={formatNumber(
                  data.network_statistics
                    ?.valid_recovery_paths
                )}
                caption="Valid network paths"
                className="text-cyan-400"
              />

              <MetricCard
                icon={<Truck size={19} />}
                label="Vehicles Available"
                value={formatNumber(
                  data.network_statistics
                    ?.available_vehicles
                )}
                caption="Available recovery vehicles"
                className="text-cyan-400"
              />
            </section>

            {/* ==================================================
                RECOMMENDATION + CURRENT ROUTE
            ================================================== */}

            <section className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
              {/* RECOMMENDATION */}

              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.025] p-6 lg:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-400">
                      <Target size={13} />
                      Recommended Recovery
                    </div>

                    <h2 className="mt-3 text-2xl font-semibold">
                      {formatStrategy(
                        recommendation.strategy
                      )}
                    </h2>
                  </div>

                  <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] px-4 py-3 text-right">
                    <div className="text-[9px] uppercase tracking-[0.15em] text-slate-600">
                      Recovery Score
                    </div>

                    <div className="mt-1 text-xl font-bold text-cyan-300">
                      {formatNumber(
                        recommendation.recovery_score,
                        2
                      )}
                    </div>
                  </div>
                </div>

                {/* ROUTE STRATEGY */}

                <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/[0.07] text-cyan-400">
                      <RouteIcon
                        size={20}
                      />
                    </div>

                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600">
                        Route Strategy
                      </div>

                      <div className="mt-1 text-base font-semibold text-white">
                        {formatStrategy(
                          recommendation.route_strategy
                        )}
                      </div>
                    </div>
                  </div>

                  {/* SAFE ROUTE PATH */}

                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    {safeRoutePath.length >
                    0 ? (
                      safeRoutePath.map(
                        (
                          location,
                          index
                        ) => (
                          <div
                            key={`${location}-${index}`}
                            className="flex items-center gap-2"
                          >
                            <span className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 font-mono text-xs text-slate-300">
                              L{location}
                            </span>

                            {index <
                              safeRoutePath.length -
                                1 && (
                              <ArrowRight
                                size={13}
                                className="text-slate-700"
                              />
                            )}
                          </div>
                        )
                      )
                    ) : (
                      <span className="text-xs text-slate-600">
                        No route path available
                      </span>
                    )}
                  </div>
                </div>

                {/* VEHICLE */}

                <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-400/[0.07] text-orange-400">
                        <Truck size={20} />
                      </div>

                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600">
                          Recommended Vehicle
                        </div>

                        <div className="mt-1 text-base font-semibold text-white">
                          Vehicle #
                          {text(
                            recommendation.vehicle_id
                          )}
                          {" · "}
                          {text(
                            recommendation.vehicle_type
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setVehicleDrawer(
                          true
                        )
                      }
                      className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-slate-400 transition hover:border-cyan-400/20 hover:text-cyan-300"
                    >
                      View vehicles
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <MiniMetric
                      label="Utilization"
                      value={`${formatNumber(
                        recommendation.utilization_percentage,
                        1
                      )}%`}
                    />

                    <MiniMetric
                      label="Vehicle Status"
                      value={
                        safeVehicles.find(
                          (vehicle) =>
                            vehicle.vehicle_id ===
                            recommendation.vehicle_id
                        )?.status ||
                        "AVAILABLE"
                      }
                    />
                  </div>
                </div>

                {/* REASON */}

                <div className="mt-5 flex items-start gap-3 rounded-xl border border-cyan-400/10 bg-cyan-400/[0.025] p-4">
                  <CheckCircle2
                    size={17}
                    className="mt-0.5 shrink-0 text-cyan-400"
                  />

                  <p className="text-xs leading-6 text-slate-400">
                    {text(
                      recommendation.reason,
                      "Recovery engine recommends this strategy based on current shipment, route and vehicle conditions."
                    )}
                  </p>
                </div>
              </div>

              {/* CURRENT ROUTE */}

              <div className="rounded-2xl border border-white/[0.08] bg-[#070c10] p-6 lg:p-7">
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-orange-400">
                  Current Route Exposure
                </div>

                <h3 className="mt-3 text-xl font-semibold">
                  {text(
                    currentRoute.route_code
                  )}
                </h3>

                <div
                  className={`mt-5 rounded-xl border p-5 ${riskBorder(
                    currentRoute.risk_score
                  )}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.15em] text-slate-600">
                        Route Risk
                      </div>

                      <div
                        className={`mt-1 text-3xl font-semibold ${riskText(
                          currentRoute.risk_score
                        )}`}
                      >
                        {formatNumber(
                          currentRoute.risk_score,
                          2
                        )}
                      </div>
                    </div>

                    <span
                      className={`rounded-full border px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] ${riskText(
                        currentRoute.risk_score
                      )}`}
                    >
                      {riskLabel(
                        currentRoute.risk_score
                      )}
                    </span>
                  </div>

                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-black/20">
                    <div
                      className={`h-full rounded-full ${riskBar(
                        currentRoute.risk_score
                      )}`}
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            0,
                            num(
                              currentRoute.risk_score
                            )
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <MiniMetric
                    label="Distance"
                    value={`${formatNumber(
                      currentRoute.distance_km,
                      1
                    )} km`}
                  />

                  <MiniMetric
                    label="ETA"
                    value={`${formatNumber(
                      currentRoute.estimated_time_hours,
                      2
                    )} h`}
                  />

                  <MiniMetric
                    label="Base Cost"
                    value={formatCurrency(
                      currentRoute.base_cost
                    )}
                  />

                  <MiniMetric
                    label="Status"
                    value={text(
                      currentRoute.status
                    )}
                  />
                </div>

                {/* RECOVERY IMPACT */}

                <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">
                    Recovery Impact
                  </div>

                  <div className="mt-4 space-y-4">
                    <ComparisonRow
                      label="Risk change"
                      value={
                        routeRiskDifference >
                        0
                          ? `-${formatNumber(
                              routeRiskDifference,
                              2
                            )}`
                          : `+${formatNumber(
                              Math.abs(
                                routeRiskDifference
                              ),
                              2
                            )}`
                      }
                      positive={
                        routeRiskDifference >
                        0
                      }
                    />

                    <ComparisonRow
                      label="Risk reduction"
                      value={`${formatNumber(
                        riskReduction,
                        1
                      )}%`}
                      positive={
                        riskReduction >
                        0
                      }
                    />

                    <ComparisonRow
                      label="Time change"
                      value={
                        timeDifference >
                        0
                          ? `+${formatNumber(
                              timeDifference,
                              2
                            )} h`
                          : `${formatNumber(
                              timeDifference,
                              2
                            )} h`
                      }
                      positive={
                        timeDifference <=
                        0
                      }
                    />

                    <ComparisonRow
                      label="Cost change"
                      value={
                        costDifference >
                        0
                          ? `+${formatCurrency(
                              costDifference
                            )}`
                          : costDifference <
                            0
                          ? `-${formatCurrency(
                              Math.abs(
                                costDifference
                              )
                            )}`
                          : "₹0"
                      }
                      positive={
                        costDifference <=
                        0
                      }
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* ==================================================
                NETWORK RECOVERY PATH
            ================================================== */}

            <section className="mt-6 rounded-2xl border border-white/[0.08] bg-[#070c10] p-6 lg:p-7">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-400">
                    <GitBranch size={13} />
                    Network Recovery Path
                  </div>

                  <h3 className="mt-2 text-xl font-semibold">
                    Optimized route execution
                  </h3>

                  <p className="mt-1 text-xs text-slate-600">
                    Optimization engine:{" "}
                    {text(
                      data.optimization
                    )}
                  </p>
                </div>

                <div
                  className={`rounded-full border px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] ${
                    recommendation.destination_reached
                      ? "border-cyan-400/20 bg-cyan-400/[0.05] text-cyan-300"
                      : "border-red-400/20 bg-red-400/[0.05] text-red-300"
                  }`}
                >
                  {recommendation.destination_reached
                    ? "Destination reachable"
                    : "Destination not reached"}
                </div>
              </div>

              {selectedPath ? (
                <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
                  {/* SEGMENTS */}

                  <div>
                    {safeSelectedSegments.length >
                    0 ? (
                      <div className="space-y-3">
                        {safeSelectedSegments.map(
                          (
                            segment,
                            index
                          ) => (
                            <div
                              key={`${segment.route_id}-${index}`}
                              className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4"
                            >
                              <div className="flex items-center gap-4">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/[0.06] text-cyan-400">
                                  <RouteIcon
                                    size={17}
                                  />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                      <div className="font-mono text-sm font-semibold text-white">
                                        {text(
                                          segment.route_code
                                        )}
                                      </div>

                                      <div className="mt-1 text-[10px] text-slate-600">
                                        Location{" "}
                                        {text(
                                          segment.source_location_id
                                        )}{" "}
                                        →{" "}
                                        {text(
                                          segment.destination_location_id
                                        )}
                                      </div>
                                    </div>

                                    <div
                                      className={`text-sm font-bold ${riskText(
                                        segment.operational_risk
                                      )}`}
                                    >
                                      {formatNumber(
                                        segment.operational_risk,
                                        2
                                      )}
                                    </div>
                                  </div>

                                  <div className="mt-4 grid grid-cols-3 gap-2">
                                    <SmallStat
                                      label="Distance"
                                      value={`${formatNumber(
                                        segment.distance_km,
                                        1
                                      )} km`}
                                    />

                                    <SmallStat
                                      label="Time"
                                      value={`${formatNumber(
                                        segment.estimated_time_hours,
                                        2
                                      )} h`}
                                    />

                                    <SmallStat
                                      label="Cost"
                                      value={formatCurrency(
                                        segment.base_cost
                                      )}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    ) : (
                      <EmptyState
                        title="No route segments"
                        description="The recovery engine did not return route segment details."
                      />
                    )}
                  </div>

                  {/* PATH METRICS */}

                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
                    <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">
                      Path Metrics
                    </div>

                    <div className="mt-4 space-y-4">
                      <PathMetric
                        label="Segments"
                        value={formatNumber(
                          selectedMetrics.segment_count
                        )}
                      />

                      <PathMetric
                        label="Distance"
                        value={`${formatNumber(
                          selectedMetrics.distance_km,
                          1
                        )} km`}
                      />

                      <PathMetric
                        label="Travel Time"
                        value={`${formatNumber(
                          selectedMetrics.estimated_time_hours,
                          2
                        )} h`}
                      />

                      <PathMetric
                        label="Base Cost"
                        value={formatCurrency(
                          selectedMetrics.base_cost
                        )}
                      />

                      <PathMetric
                        label="Average Risk"
                        value={formatNumber(
                          selectedMetrics.average_risk,
                          2
                        )}
                      />

                      <PathMetric
                        label="Maximum Risk"
                        value={formatNumber(
                          selectedMetrics.maximum_risk,
                          2
                        )}
                      />

                      <PathMetric
                        label="Path Score"
                        value={formatNumber(
                          selectedMetrics.path_score,
                          2
                        )}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6">
                  <EmptyState
                    title="No recovery path returned"
                    description="The recovery engine did not return a valid recovery path for this shipment."
                  />
                </div>
              )}
            </section>

            {/* ==================================================
                EXPLANATION
            ================================================== */}

            <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
              <div className="rounded-2xl border border-white/[0.08] bg-[#070c10] p-6 lg:p-7">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-orange-400">
                  <Activity size={13} />
                  Decision Explanation
                </div>

                <h3 className="mt-2 text-xl font-semibold">
                  Why LogiShield chose this recovery
                </h3>

                {safeExplanation.length >
                0 ? (
                  <div className="mt-5 space-y-3">
                    {safeExplanation.map(
                      (
                        explanation,
                        index
                      ) => (
                        <div
                          key={`${index}-${explanation}`}
                          className="flex items-start gap-3 rounded-xl border border-white/[0.05] bg-white/[0.015] p-4"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-400/[0.06] text-[10px] font-bold text-orange-400">
                            {String(
                              index + 1
                            ).padStart(
                              2,
                              "0"
                            )}
                          </div>

                          <p className="text-xs leading-6 text-slate-400">
                            {explanation}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className="mt-5">
                    <EmptyState
                      title="No explanation returned"
                      description="The recovery engine did not return explanatory details."
                    />
                  </div>
                )}
              </div>

              {/* DISRUPTION CONTEXT */}

              <div className="rounded-2xl border border-white/[0.08] bg-[#070c10] p-6">
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-400">
                  Disruption Context
                </div>

                <div className="mt-5 space-y-3">
                  <ContextRow
                    icon={
                      <CloudRain size={16} />
                    }
                    label="Weather"
                    value={text(
                      risk.weather
                    )}
                  />

                  <ContextRow
                    icon={
                      <Activity size={16} />
                    }
                    label="Traffic"
                    value={text(
                      risk.traffic
                    )}
                  />

                  <ContextRow
                    icon={
                      <AlertTriangle
                        size={16}
                      />
                    }
                    label="Active Disruptions"
                    value={formatNumber(
                      risk.active_disruptions
                    )}
                  />

                  <ContextRow
                    icon={
                      <Gauge size={16} />
                    }
                    label="Maximum Severity"
                    value={formatNumber(
                      risk.maximum_disruption_severity
                    )}
                  />

                  <ContextRow
                    icon={
                      <Zap size={16} />
                    }
                    label="Intervention"
                    value={formatStrategy(
                      risk.intervention
                    )}
                  />
                </div>
              </div>
            </section>

            {/* ==================================================
                NETWORK TELEMETRY
            ================================================== */}

            <section className="mt-6 rounded-2xl border border-white/[0.08] bg-[#070c10] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
                    Recovery Engine Telemetry
                  </div>

                  <h3 className="mt-2 text-lg font-semibold">
                    Live decision context
                  </h3>
                </div>

                <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.12em] text-cyan-400">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  Operational
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Telemetry
                  label="Open Routes"
                  value={formatNumber(
                    data.network_statistics
                      ?.total_open_routes
                  )}
                />

                <Telemetry
                  label="Valid Recovery Paths"
                  value={formatNumber(
                    data.network_statistics
                      ?.valid_recovery_paths
                  )}
                />

                <Telemetry
                  label="Available Vehicles"
                  value={formatNumber(
                    data.network_statistics
                      ?.available_vehicles
                  )}
                />

                <Telemetry
                  label="Recovery Options"
                  value={formatNumber(
                    data.option_count
                  )}
                />
              </div>
            </section>
          </>
        )}
      </div>

      {/* ======================================================
          VEHICLE DRAWER
      ====================================================== */}

      {vehicleDrawer && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          onClick={() =>
            setVehicleDrawer(
              false
            )
          }
        >
          <div
            className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-white/[0.08] bg-[#070b0f]"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/[0.07] bg-[#070b0f]/95 px-6 py-5 backdrop-blur-xl">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
                  Vehicle Analysis
                </div>

                <h2 className="mt-1 text-lg font-semibold">
                  Available Recovery Vehicles
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setVehicleDrawer(
                    false
                  )
                }
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 p-6">
              {safeVehicles.length >
              0 ? (
                safeVehicles.map(
                  (vehicle) => {
                    const recommended =
                      vehicle.vehicle_id ===
                      recommendation.vehicle_id;

                    return (
                      <div
                        key={
                          vehicle.vehicle_id
                        }
                        className={`rounded-xl border p-4 ${
                          recommended
                            ? "border-cyan-400/20 bg-cyan-400/[0.035]"
                            : "border-white/[0.06] bg-white/[0.015]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] text-cyan-400">
                            <Car size={18} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-white">
                                Vehicle #
                                {text(
                                  vehicle.vehicle_id
                                )}
                              </div>

                              <div className="text-sm font-bold text-cyan-300">
                                {formatNumber(
                                  vehicle.vehicle_score,
                                  1
                                )}
                              </div>
                            </div>

                            <div className="mt-1 text-[10px] text-slate-600">
                              {text(
                                vehicle.vehicle_type
                              )}
                            </div>
                          </div>

                          {recommended && (
                            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.1em] text-cyan-300">
                              Recommended
                            </span>
                          )}
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2">
                          <SmallStat
                            label="Capacity"
                            value={`${formatNumber(
                              vehicle.capacity_kg
                            )} kg`}
                          />

                          <SmallStat
                            label="Utilization"
                            value={`${formatNumber(
                              vehicle.utilization_percentage,
                              1
                            )}%`}
                          />

                          <SmallStat
                            label="Status"
                            value={text(
                              vehicle.status
                            )}
                          />
                        </div>
                      </div>
                    );
                  }
                )
              ) : (
                <EmptyState
                  title="No vehicle data"
                  description="The recovery engine did not return alternative vehicle information."
                />
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ============================================================
   UI COMPONENTS
============================================================ */

function EnginePill({
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

function MetricCard({
  icon,
  label,
  value,
  caption,
  className,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  caption: string;
  className: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#070c10] p-5">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] ${className}`}
      >
        {icon}
      </div>

      <div
        className={`mt-5 text-2xl font-semibold ${className}`}
      >
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

function DecisionBadge({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3">
      <div className="text-[8px] uppercase tracking-[0.14em] text-slate-600">
        {label}
      </div>

      <div
        className={`mt-1 text-lg font-bold ${className}`}
      >
        {value}
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.015] p-3">
      <div className="text-[8px] uppercase tracking-[0.12em] text-slate-700">
        {label}
      </div>

      <div className="mt-1 text-xs font-semibold text-slate-300">
        {value}
      </div>
    </div>
  );
}

function ComparisonRow({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-slate-600">
        {label}
      </span>

      <span
        className={`text-xs font-bold ${
          positive
            ? "text-cyan-300"
            : "text-orange-300"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function SmallStat({
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

      <div className="mt-1 truncate text-[10px] font-semibold text-slate-300">
        {value}
      </div>
    </div>
  );
}

function PathMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.04] pb-3 last:border-0 last:pb-0">
      <span className="text-xs text-slate-600">
        {label}
      </span>

      <span className="text-xs font-semibold text-slate-300">
        {value}
      </span>
    </div>
  );
}

function ContextRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.015] p-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/[0.05] text-cyan-400">
        {icon}
      </div>

      <div className="flex-1">
        <div className="text-[9px] uppercase tracking-[0.12em] text-slate-700">
          {label}
        </div>

        <div className="mt-1 text-xs font-semibold text-slate-300">
          {value}
        </div>
      </div>
    </div>
  );
}

function Telemetry({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
      <div className="text-[9px] uppercase tracking-[0.14em] text-slate-600">
        {label}
      </div>

      <div className="mt-2 text-xl font-semibold text-white">
        {value}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] p-8 text-center">
      <div className="text-sm font-medium text-slate-400">
        {title}
      </div>

      <div className="mt-2 text-xs leading-5 text-slate-700">
        {description}
      </div>
    </div>
  );
}

function LoadingBlock({
  height,
}: {
  height: string;
}) {
  return (
    <div
      className={`${height} animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]`}
    />
  );
}