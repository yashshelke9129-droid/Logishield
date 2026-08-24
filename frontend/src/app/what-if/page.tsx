"use client";

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CloudRain,
  Gauge,
  GitBranch,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Truck,
  Zap,
} from "lucide-react";

import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";


// ============================================================
// TYPES
// ============================================================

type Scenario = {
  disruption: string;
  severity: string;
  probability: number;
  traffic: number;
  weather: number;
  routeImpact: number;
};

type DashboardData = {
  overview?: {
    total_shipments?: number;
    delivered_shipments?: number;
    delayed_shipments?: number;
    in_transit_shipments?: number;
    cancelled_shipments?: number;
    delay_percentage?: number;
  };

  risk?: {
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
    average_delay_probability?: number;
    average_delay_probability_percentage?: number;
  };

  disruptions?: {
    total?: number;
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
  };

  routes?: {
    total?: number;
    open?: number;
    unavailable?: number;
    average_risk?: number;
    average_distance_km?: number;
  };

  vehicles?: {
    total?: number;
    available?: number;
    active?: number;
    unavailable?: number;
    average_capacity_kg?: number;
  };
};


// ============================================================
// CONSTANTS
// ============================================================

// The live network baseline is loaded from the centralized
// LogiShield API configuration (@/lib/api). When the API is
// unreachable the page shows an explicit connection error and
// NEVER substitutes hard-coded baseline numbers.


// ============================================================
// HELPERS
// ============================================================

function numberValue(
  value: number | undefined,
  fallback = 0
) {
  return Number.isFinite(value)
    ? Number(value)
    : fallback;
}


function formatNumber(
  value: number
) {
  return new Intl.NumberFormat(
    "en-IN"
  ).format(
    Math.round(value)
  );
}


function formatPercent(
  value: number
) {
  return `${value.toFixed(1)}%`;
}


function clamp(
  value: number,
  min: number,
  max: number
) {
  return Math.min(
    max,
    Math.max(
      min,
      value
    )
  );
}


// ============================================================
// COMPONENT
// ============================================================

export default function WhatIfPage() {

  // ----------------------------------------------------------
  // STATE
  // ----------------------------------------------------------

  const [
    dashboard,
    setDashboard
  ] = useState<DashboardData | null>(
    null
  );

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    refreshing,
    setRefreshing
  ] = useState(false);

  const [
    apiError,
    setApiError
  ] = useState("");


  const [
    scenario,
    setScenario
  ] = useState<Scenario>({
    disruption:
      "TRAFFIC_CONGESTION",

    severity:
      "HIGH",

    probability:
      65,

    traffic:
      55,

    weather:
      20,

    routeImpact:
      35,
  });


  // ----------------------------------------------------------
  // LOAD DASHBOARD
  // ----------------------------------------------------------

  async function loadDashboard() {

    try {

      setApiError("");

      const data =
        await apiFetch<DashboardData>(
          "/api/v1/dashboard/overview"
        );

      setDashboard(data);

    } catch (error) {

      console.error(
        "What-if dashboard error:",
        error
      );

      // Drop any previous baseline so the page never mixes
      // stale data with a failed refresh, and never invents
      // numbers when no data was ever loaded.

      setDashboard(null);

      setApiError(
        error instanceof Error
          ? error.message
          : "Unable to connect to the LogiShield API."
      );

    } finally {

      setLoading(false);
      setRefreshing(false);

    }
  }


  // ----------------------------------------------------------
  // INITIAL LOAD
  // ----------------------------------------------------------

  useEffect(() => {

    loadDashboard();

  }, []);


  // ----------------------------------------------------------
  // REFRESH
  // ----------------------------------------------------------

  async function handleRefresh() {

    setRefreshing(true);

    await loadDashboard();

  }


  // ----------------------------------------------------------
  // BASE DATA
  //
  // IMPORTANT:
  // There are deliberately NO hard-coded fallback numbers
  // here. When the baseline has not been loaded the page
  // renders an explicit connection error instead of fake
  // business data. Real zero values from the database remain
  // perfectly valid.
  // ----------------------------------------------------------

  const hasBaseline =
    !apiError &&
    dashboard !== null;


  const totalShipments =
    numberValue(
      dashboard?.overview
        ?.total_shipments
    );


  const delayedShipments =
    numberValue(
      dashboard?.overview
        ?.delayed_shipments
    );


  const baseDelay =
    numberValue(
      dashboard?.risk
        ?.average_delay_probability_percentage
    );


  const baseCritical =
    numberValue(
      dashboard?.risk
        ?.critical
    );


  const baseHigh =
    numberValue(
      dashboard?.risk
        ?.high
    );


  const routeCount =
    numberValue(
      dashboard?.routes?.total
    );


  const routeRisk =
    numberValue(
      dashboard?.routes?.average_risk
    );


  // ----------------------------------------------------------
  // SCENARIO ENGINE
  // ----------------------------------------------------------

  const simulation = useMemo(() => {

    const severityMultiplier: Record<
      string,
      number
    > = {

      LOW: 0.65,

      MEDIUM: 0.90,

      HIGH: 1.20,

      CRITICAL: 1.50,

    };


    const multiplier =
      severityMultiplier[
        scenario.severity
      ] ?? 1;


    const disruptionFactor =
      scenario.probability / 100;


    const trafficFactor =
      scenario.traffic / 100;


    const weatherFactor =
      scenario.weather / 100;


    const routeFactor =
      scenario.routeImpact / 100;


    const combinedImpact =
      (
        disruptionFactor * 0.40
      ) +
      (
        trafficFactor * 0.20
      ) +
      (
        weatherFactor * 0.15
      ) +
      (
        routeFactor * 0.25
      );


    const projectedDelay =
      clamp(
        baseDelay +
          (
            combinedImpact *
            58 *
            multiplier
          ),
        0,
        99.9
      );


    const additionalDelay =
      Math.max(
        0,
        projectedDelay -
          baseDelay
      );


    const affectedShipments =
      Math.round(
        totalShipments *
        clamp(
          (
            combinedImpact *
            0.82
          ) +
          0.04,
          0,
          0.95
        )
      );


    const criticalIncrease =
      Math.round(
        affectedShipments *
        (
          0.10 +
          disruptionFactor *
          0.16
        ) *
        multiplier
      );


    const projectedCritical =
      clamp(
        baseCritical +
          criticalIncrease,
        0,
        totalShipments
      );


    const projectedHigh =
      clamp(
        baseHigh +
          Math.round(
            affectedShipments *
            0.18 *
            multiplier
          ),
        0,
        totalShipments
      );


    const projectedNetworkRisk =
      clamp(
        routeRisk +
          (
            combinedImpact *
            72 *
            multiplier
          ),
        0,
        100
      );


    const estimatedDelayHours =
      clamp(
        1.2 +
          (
            projectedDelay *
            0.055
          ) +
          (
            scenario.routeImpact *
            0.035
          ),
        0.5,
        96
      );


    const estimatedCostImpact =
      Math.round(
        affectedShipments *
        (
          350 +
          projectedDelay *
          18
        )
      );


    const estimatedRecoveryCost =
      Math.round(
        estimatedCostImpact *
        (
          0.18 +
          routeFactor *
          0.18
        )
      );


    const estimatedSavings =
      Math.max(
        0,
        Math.round(
          estimatedCostImpact *
          (
            0.42 -
            routeFactor *
            0.08
          )
        )
      );


    let recommendation =
      "Monitor and rebalance affected shipments";


    let recommendationDetail =
      "Prioritize high-risk shipments and continuously monitor route conditions.";


    if (
      scenario.severity ===
      "CRITICAL"
    ) {

      recommendation =
        "Activate emergency recovery plan";

      recommendationDetail =
        "Immediately reroute critical shipments, reserve alternate capacity, and activate disruption response.";

    } else if (
      projectedNetworkRisk >= 70
    ) {

      recommendation =
        "Reroute exposed shipments";

      recommendationDetail =
        "Shift traffic away from the highest-risk route segments and prioritize alternative network paths.";

    } else if (
      projectedDelay >= 60
    ) {

      recommendation =
        "Prioritize critical shipments";

      recommendationDetail =
        "Use available vehicles and operational capacity to protect critical shipments first.";

    } else if (
      projectedDelay >= 45
    ) {

      recommendation =
        "Increase operational monitoring";

      recommendationDetail =
        "Increase monitoring frequency and prepare recovery capacity before the disruption escalates.";

    }


    const routeAvailability =
      clamp(
        100 -
          (
            combinedImpact *
            100 *
            multiplier
          ),
        5,
        100
      );


    const vehiclesRequired =
      Math.max(
        1,
        Math.round(
          (
            affectedShipments /
            500
          ) *
          (
            0.45 +
            routeFactor
          )
        )
      );


    return {

      combinedImpact,

      projectedDelay,

      additionalDelay,

      affectedShipments,

      projectedCritical,

      projectedHigh,

      projectedNetworkRisk,

      estimatedDelayHours,

      estimatedCostImpact,

      estimatedRecoveryCost,

      estimatedSavings,

      recommendation,

      recommendationDetail,

      routeAvailability,

      vehiclesRequired,

    };

  }, [
    scenario,
    totalShipments,
    baseDelay,
    baseCritical,
    baseHigh,
    routeRisk,
  ]);


  // ----------------------------------------------------------
  // SCENARIO CHANGE
  // ----------------------------------------------------------

  function updateScenario(
    key: keyof Scenario,
    value: string | number
  ) {

    setScenario(
      previous => ({
        ...previous,
        [key]: value,
      })
    );

  }


  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------

  return (

    <main className="min-h-screen bg-[#05090d] text-white">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#05090d]/95 backdrop-blur-xl">

        <div className="flex h-[86px] items-center justify-between px-6 lg:px-10">

          <div className="flex items-center gap-4">

            <button
              onClick={() => {
                window.location.href = "/";
              }}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.02] text-slate-400 transition hover:border-cyan-400/30 hover:text-cyan-300"
            >
              <ArrowLeft
                size={20}
              />
            </button>

            <div>

              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-400/70">
                LOGISHIELD · SCENARIO INTELLIGENCE
              </p>

              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                What-if Simulator
              </h1>

            </div>

          </div>


          <div className="flex items-center gap-3">

            <div
              className={`hidden items-center gap-2 rounded-xl px-4 py-2.5 sm:flex ${
                apiError
                  ? "border border-red-400/20 bg-red-400/[0.04]"
                  : "border border-cyan-400/10 bg-cyan-400/[0.03]"
              }`}
            >

              <span
                className={`h-2 w-2 rounded-full ${
                  apiError
                    ? "bg-red-400"
                    : "bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]"
                }`}
              />

              <span
                className={`text-[10px] font-bold uppercase tracking-[0.16em] ${
                  apiError
                    ? "text-red-300"
                    : "text-cyan-300"
                }`}
              >
                {apiError
                  ? "BASELINE OFFLINE"
                  : loading
                  ? "SYNCING BASELINE"
                  : "SIMULATION ENGINE LIVE"}
              </span>

            </div>


            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-sm text-slate-300 transition hover:border-cyan-400/30 hover:text-white disabled:opacity-50"
            >

              {refreshing ? (
                <Loader2
                  size={17}
                  className="animate-spin"
                />
              ) : (
                <RefreshCw
                  size={17}
                />
              )}

              Refresh

            </button>


            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-300 text-xs font-black text-slate-950">
              LS
            </div>

          </div>

        </div>

      </header>


      {/* =====================================================
          CONTENT
      ===================================================== */}

      <div className="mx-auto max-w-[1550px] px-5 py-7 lg:px-10 lg:py-9">


        {/* ===================================================
            HERO
        =================================================== */}

        <section className="relative overflow-hidden rounded-2xl border border-cyan-400/[0.12] bg-gradient-to-br from-cyan-400/[0.07] via-[#08131b] to-[#080d12] p-7 lg:p-9">

          <div className="pointer-events-none absolute -right-32 -top-40 h-96 w-96 rounded-full bg-cyan-400/[0.05] blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">

            <div>

              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-400/80">
                SCENARIO CONTROL
              </p>

              <h2 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight lg:text-4xl">
                Model the impact before the disruption happens.
              </h2>

              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">
                Change operational conditions and evaluate projected shipment delays, network risk, affected capacity, cost exposure and the recommended recovery response.
              </p>

            </div>


            <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/[0.03]">

              <Zap
                size={25}
                className="text-cyan-300"
              />

              <span className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">
                LIVE
              </span>

            </div>

          </div>

        </section>


        {/* ===================================================
            ERROR
        =================================================== */}

        {apiError && (

          <div className="mt-5 flex flex-col justify-between gap-4 rounded-xl border border-red-400/25 bg-red-400/[0.05] px-5 py-4 sm:flex-row sm:items-center">

            <div className="flex items-start gap-3">

              <AlertTriangle
                size={18}
                className="mt-0.5 shrink-0 text-red-300"
              />

              <div>

                <p className="text-sm font-medium text-red-200">
                  API / database connection error
                </p>

                <p className="mt-1 max-w-3xl text-xs leading-5 text-red-300/80">
                  The What-if Simulator could not load the live
                  network baseline from the LogiShield API.
                  Scenario results are hidden instead of showing
                  fabricated numbers. {apiError}
                </p>

              </div>

            </div>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/[0.08] px-4 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-400/[0.15] disabled:opacity-50"
            >

              <RefreshCw
                size={14}
                className={
                  refreshing ? "animate-spin" : ""
                }
              />

              Retry connection

            </button>

          </div>

        )}


        {/* ===================================================
            MAIN GRID
        =================================================== */}

        <section className="mt-6 grid gap-6 xl:grid-cols-[390px_1fr]">


          {/* =================================================
              CONTROLS
          ================================================= */}

          <div className="rounded-2xl border border-white/[0.07] bg-[#080e14] p-6">

            <div className="flex items-center justify-between">

              <div>

                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-400/70">
                  SCENARIO INPUT
                </p>

                <h3 className="mt-2 text-xl font-semibold">
                  Configure disruption
                </h3>

              </div>

              <Gauge
                size={22}
                className="text-cyan-300"
              />

            </div>


            {/* DISRUPTION */}

            <div className="mt-7">

              <label className="text-xs font-medium text-slate-400">
                Disruption Type
              </label>

              <select
                value={scenario.disruption}
                onChange={event =>
                  updateScenario(
                    "disruption",
                    event.target.value
                  )
                }
                className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#050a0f] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/40"
              >

                <option value="TRAFFIC_CONGESTION">
                  Traffic Congestion
                </option>

                <option value="HEAVY_RAIN">
                  Heavy Rain
                </option>

                <option value="VEHICLE_BREAKDOWN">
                  Vehicle Breakdown
                </option>

                <option value="ROAD_CLOSURE">
                  Road Closure
                </option>

                <option value="SUPPLIER_DELAY">
                  Supplier Delay
                </option>

                <option value="FLOOD">
                  Flood
                </option>

                <option value="WAREHOUSE_FAILURE">
                  Warehouse Failure
                </option>

                <option value="LABOUR_SHORTAGE">
                  Labour Shortage
                </option>

                <option value="CYCLONE">
                  Cyclone
                </option>

              </select>

            </div>


            {/* SEVERITY */}

            <div className="mt-6">

              <label className="text-xs font-medium text-slate-400">
                Severity
              </label>

              <div className="mt-2 grid grid-cols-4 gap-2">

                {[
                  "LOW",
                  "MEDIUM",
                  "HIGH",
                  "CRITICAL",
                ].map(level => (

                  <button
                    key={level}
                    onClick={() =>
                      updateScenario(
                        "severity",
                        level
                      )
                    }
                    className={`rounded-lg border px-2 py-2.5 text-[10px] font-bold tracking-wide transition ${
                      scenario.severity === level
                        ? "border-cyan-400/40 bg-cyan-400/[0.10] text-cyan-300"
                        : "border-white/[0.07] bg-white/[0.02] text-slate-500 hover:border-white/[0.15] hover:text-slate-300"
                    }`}
                  >
                    {level}
                  </button>

                ))}

              </div>

            </div>


            {/* PROBABILITY */}

            <div className="mt-7">

              <div className="flex items-center justify-between">

                <label className="text-xs font-medium text-slate-400">
                  Disruption Probability
                </label>

                <span className="text-sm font-bold text-cyan-300">
                  {scenario.probability}%
                </span>

              </div>

              <input
                type="range"
                min="0"
                max="100"
                value={scenario.probability}
                onChange={event =>
                  updateScenario(
                    "probability",
                    Number(event.target.value)
                  )
                }
                className="mt-4 w-full accent-cyan-400"
              />

            </div>


            {/* TRAFFIC */}

            <div className="mt-7">

              <div className="flex items-center justify-between">

                <label className="flex items-center gap-2 text-xs font-medium text-slate-400">

                  <Activity
                    size={14}
                  />

                  Traffic Impact

                </label>

                <span className="text-sm font-bold text-white">
                  {scenario.traffic}%
                </span>

              </div>

              <input
                type="range"
                min="0"
                max="100"
                value={scenario.traffic}
                onChange={event =>
                  updateScenario(
                    "traffic",
                    Number(event.target.value)
                  )
                }
                className="mt-4 w-full accent-cyan-400"
              />

            </div>


            {/* WEATHER */}

            <div className="mt-7">

              <div className="flex items-center justify-between">

                <label className="flex items-center gap-2 text-xs font-medium text-slate-400">

                  <CloudRain
                    size={14}
                  />

                  Weather Impact

                </label>

                <span className="text-sm font-bold text-white">
                  {scenario.weather}%
                </span>

              </div>

              <input
                type="range"
                min="0"
                max="100"
                value={scenario.weather}
                onChange={event =>
                  updateScenario(
                    "weather",
                    Number(event.target.value)
                  )
                }
                className="mt-4 w-full accent-cyan-400"
              />

            </div>


            {/* ROUTE */}

            <div className="mt-7">

              <div className="flex items-center justify-between">

                <label className="flex items-center gap-2 text-xs font-medium text-slate-400">

                  <GitBranch
                    size={14}
                  />

                  Route Exposure

                </label>

                <span className="text-sm font-bold text-white">
                  {scenario.routeImpact}%
                </span>

              </div>

              <input
                type="range"
                min="0"
                max="100"
                value={scenario.routeImpact}
                onChange={event =>
                  updateScenario(
                    "routeImpact",
                    Number(event.target.value)
                  )
                }
                className="mt-4 w-full accent-cyan-400"
              />

            </div>


            {/* RESET */}

            <button
              onClick={() =>
                setScenario({
                  disruption:
                    "TRAFFIC_CONGESTION",

                  severity:
                    "HIGH",

                  probability:
                    65,

                  traffic:
                    55,

                  weather:
                    20,

                  routeImpact:
                    35,
                })
              }
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-cyan-400/30 hover:text-white"
            >

              <RefreshCw
                size={16}
              />

              Reset Scenario

            </button>

          </div>


          {/* =================================================
              RESULTS

              Scenario numbers are only rendered from a live
              API baseline. While loading a skeleton is shown;
              if the API is unreachable an explicit connection
              error replaces every simulated value.
          ================================================= */}

          <div className="space-y-6">

            {hasBaseline ? (
              <>

            {/* RESULT CARDS */}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

              <ResultCard
                icon={
                  <Activity
                    size={20}
                  />
                }
                label="Projected Delay"
                value={
                  formatPercent(
                    simulation.projectedDelay
                  )
                }
                detail={
                  `+${simulation.additionalDelay.toFixed(1)} pts`
                }
                emphasis="cyan"
              />


              <ResultCard
                icon={
                  <ShieldAlert
                    size={20}
                  />
                }
                label="Critical Shipments"
                value={
                  formatNumber(
                    simulation.projectedCritical
                  )
                }
                detail={
                  `+${formatNumber(
                    Math.max(
                      0,
                      simulation.projectedCritical -
                        baseCritical
                    )
                  )}`
                }
                emphasis="red"
              />


              <ResultCard
                icon={
                  <Truck
                    size={20}
                  />
                }
                label="Affected Shipments"
                value={
                  formatNumber(
                    simulation.affectedShipments
                  )
                }
                detail={
                  `${formatPercent(
                    (
                      simulation.affectedShipments /
                      totalShipments
                    ) *
                    100
                  )} of network`
                }
                emphasis="amber"
              />


              <ResultCard
                icon={
                  <BarChart3
                    size={20}
                  />
                }
                label="Network Risk"
                value={
                  formatPercent(
                    simulation.projectedNetworkRisk
                  )
                }
                detail={
                  `Base ${routeRisk.toFixed(1)}%`
                }
                emphasis="purple"
              />

            </div>


            {/* IMPACT ANALYSIS */}

            <div className="rounded-2xl border border-white/[0.07] bg-[#080e14] p-6">

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-400/70">
                    IMPACT ANALYSIS
                  </p>

                  <h3 className="mt-2 text-xl font-semibold">
                    Projected network consequences
                  </h3>

                </div>

                <div className="rounded-lg border border-cyan-400/10 bg-cyan-400/[0.04] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                  Scenario Active
                </div>

              </div>


              <div className="mt-7 grid gap-5 md:grid-cols-2">


                <MetricRow
                  label="Estimated delay duration"
                  value={`${simulation.estimatedDelayHours.toFixed(1)} hours`}
                  percentage={clamp(
                    simulation.estimatedDelayHours /
                      48 *
                      100,
                    0,
                    100
                  )}
                  icon={
                    <Activity
                      size={17}
                    />
                  }
                />


                <MetricRow
                  label="Route availability"
                  value={`${simulation.routeAvailability.toFixed(1)}%`}
                  percentage={
                    simulation.routeAvailability
                  }
                  icon={
                    <GitBranch
                      size={17}
                    />
                  }
                />


                <MetricRow
                  label="Additional critical exposure"
                  value={formatNumber(
                    Math.max(
                      0,
                      simulation.projectedCritical -
                        baseCritical
                    )
                  )}
                  percentage={clamp(
                    (
                      Math.max(
                        0,
                        simulation.projectedCritical -
                          baseCritical
                      ) /
                      Math.max(
                        1,
                        totalShipments
                      )
                    ) *
                    1000,
                    0,
                    100
                  )}
                  icon={
                    <ShieldAlert
                      size={17}
                    />
                  }
                />


                <MetricRow
                  label="Vehicles potentially required"
                  value={formatNumber(
                    simulation.vehiclesRequired
                  )}
                  percentage={clamp(
                    simulation.vehiclesRequired /
                      Math.max(
                        1,
                        numberValue(
                          dashboard?.vehicles?.total,
                          100
                        )
                      ) *
                      100,
                    0,
                    100
                  )}
                  icon={
                    <Truck
                      size={17}
                    />
                  }
                />

              </div>

            </div>


            {/* FINANCIAL IMPACT */}

            <div className="grid gap-6 md:grid-cols-3">

              <FinancialCard
                label="Estimated Cost Exposure"
                value={
                  `₹${formatNumber(
                    simulation.estimatedCostImpact
                  )}`
                }
                icon={
                  <BarChart3
                    size={19}
                  />
                }
              />


              <FinancialCard
                label="Recovery Investment"
                value={
                  `₹${formatNumber(
                    simulation.estimatedRecoveryCost
                  )}`
                }
                icon={
                  <Zap
                    size={19}
                  />
                }
              />


              <FinancialCard
                label="Potential Savings"
                value={
                  `₹${formatNumber(
                    simulation.estimatedSavings
                  )}`
                }
                icon={
                  <Activity
                    size={19}
                  />
                }
              />

            </div>


            {/* RECOMMENDATION */}

            <div className="relative overflow-hidden rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-400/[0.07] to-[#080e14] p-6">

              <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-400/[0.05] blur-3xl" />

              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">

                <div className="flex gap-4">

                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/[0.08]">

                    <ShieldAlert
                      size={22}
                      className="text-amber-300"
                    />

                  </div>


                  <div>

                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300/70">
                      RECOVERY RECOMMENDATION
                    </p>

                    <h3 className="mt-2 text-xl font-semibold">
                      {simulation.recommendation}
                    </h3>

                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                      {simulation.recommendationDetail}
                    </p>

                  </div>

                </div>


                <div className="shrink-0 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-5 py-4">

                  <p className="text-[10px] uppercase tracking-wider text-slate-500">
                    SIMULATION IMPACT
                  </p>

                  <p className="mt-1 text-2xl font-bold text-amber-300">
                    {formatPercent(
                      simulation.combinedImpact *
                      100
                    )}
                  </p>

                </div>

              </div>

            </div>

              </>
            ) : (
              <BaselineUnavailable
                loading={loading}
              />
            )}

          </div>

        </section>


        {/* ===================================================
            SCENARIO FOOTER
        =================================================== */}

        <section className="mt-6 rounded-2xl border border-white/[0.06] bg-[#080e14] p-5">

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/[0.07]">

                <BarChart3
                  size={18}
                  className="text-cyan-300"
                />

              </div>

              <div>

                <p className="text-sm font-semibold">
                  Scenario Baseline
                </p>

                <p className="text-xs text-slate-500">
                  {loading
                    ? "Loading live network baseline..."
                    : !hasBaseline
                    ? "Live network baseline unavailable - reconnect the API to simulate against real data."
                    : `${formatNumber(totalShipments)} shipments · ${routeCount} routes · ${formatPercent(baseDelay)} baseline delay probability`
                  }
                </p>

              </div>

            </div>


            <div className="flex items-center gap-5 text-xs text-slate-500">

              <span>
                Severity:
                <strong className="ml-1 text-slate-300">
                  {scenario.severity}
                </strong>
              </span>

              <span>
                Disruption:
                <strong className="ml-1 text-slate-300">
                  {scenario.disruption}
                </strong>
              </span>

            </div>

          </div>

        </section>

      </div>

    </main>

  );

}


// ============================================================
// BASELINE UNAVAILABLE
//
// Rendered instead of scenario results when the live network
// baseline could not be loaded. Guarantees the simulator
// never presents fabricated numbers as business data.
// ============================================================

function BaselineUnavailable({
  loading,
}: {
  loading: boolean;
}) {

  if (loading) {

    return (

      <div className="space-y-4">

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

          {Array.from({ length: 4 }).map(
            (_, index) => (
              <div
                key={index}
                className="h-[132px] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]"
              />
            )
          )}

        </div>

        <div className="h-[220px] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.015]" />

      </div>

    );

  }

  return (

    <div className="rounded-2xl border border-dashed border-red-400/25 bg-red-400/[0.03] p-10 text-center">

      <ShieldAlert
        size={26}
        className="mx-auto text-red-300"
      />

      <p className="mt-4 text-sm font-semibold text-red-200">
        Live network baseline unavailable
      </p>

      <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">
        The What-if Simulator projects impact against the real
        PostgreSQL-backed LogiShield network. Scenario controls stay
        interactive, but projected results are hidden until the API
        connection is restored.
      </p>

    </div>

  );

}


// ============================================================
// RESULT CARD
// ============================================================

function ResultCard({
  icon,
  label,
  value,
  detail,
  emphasis,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  emphasis:
    | "cyan"
    | "red"
    | "amber"
    | "purple";
}) {

  const emphasisClasses = {

    cyan:
      "text-cyan-300 bg-cyan-400/[0.07] border-cyan-400/10",

    red:
      "text-red-300 bg-red-400/[0.07] border-red-400/10",

    amber:
      "text-amber-300 bg-amber-400/[0.07] border-amber-400/10",

    purple:
      "text-violet-300 bg-violet-400/[0.07] border-violet-400/10",

  };


  return (

    <div className="rounded-2xl border border-white/[0.07] bg-[#080e14] p-5">

      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl border ${emphasisClasses[emphasis]}`}
      >
        {icon}
      </div>


      <p className="mt-6 text-xs font-medium text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-2xl font-bold tracking-tight">
        {value}
      </p>

      <p className="mt-1 text-[11px] text-slate-600">
        {detail}
      </p>

    </div>

  );

}


// ============================================================
// METRIC ROW
// ============================================================

function MetricRow({
  label,
  value,
  percentage,
  icon,
}: {
  label: string;
  value: string;
  percentage: number;
  icon: React.ReactNode;
}) {

  return (

    <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-4">

      <div className="flex items-center justify-between">

        <div className="flex items-center gap-3">

          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400/[0.06] text-cyan-300">

            {icon}

          </div>

          <span className="text-sm text-slate-400">
            {label}
          </span>

        </div>


        <span className="text-sm font-semibold text-white">
          {value}
        </span>

      </div>


      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">

        <div
          className="h-full rounded-full bg-cyan-300 transition-all duration-500"
          style={{
            width: `${clamp(
              percentage,
              0,
              100
            )}%`,
          }}
        />

      </div>

    </div>

  );

}


// ============================================================
// FINANCIAL CARD
// ============================================================

function FinancialCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {

  return (

    <div className="rounded-2xl border border-white/[0.07] bg-[#080e14] p-5">

      <div className="flex items-center gap-3">

        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/[0.06] text-cyan-300">

          {icon}

        </div>

        <p className="text-xs text-slate-500">
          {label}
        </p>

      </div>


      <p className="mt-5 text-2xl font-bold">
        {value}
      </p>

      <p className="mt-1 text-[11px] text-slate-600">
        Scenario projection
      </p>

    </div>

  );

}