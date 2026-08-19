"use client";

import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Shield,
  TrendingDown,
  TrendingUp,
  Truck,
  Activity,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

/* ============================================================
   TYPES
============================================================ */

type OverallData = {
  total_shipments?: number;
  delivered_shipments?: number;
  delayed_shipments?: number;
  in_transit_shipments?: number;
  cancelled_shipments?: number;
  average_actual_delay_hours?: number;
};

type MLData = {
  prediction_count?: number;
  critical_predictions?: number;
  high_predictions?: number;
  medium_predictions?: number;
  low_predictions?: number;
  average_delay_probability?: number;
  average_delay_probability_percentage?: number;
  average_predicted_delay_hours?: number;
  maximum_predicted_delay_hours?: number;
  average_risk_score?: number;
  maximum_risk_score?: number;
};

type MonthlyShipment = {
  month: string;
  shipment_count?: number;
  delivered_count?: number;
  delayed_count?: number;
  in_transit_count?: number;
  cancelled_count?: number;
  delay_percentage?: number;
};

type MonthlyML = {
  month: string;
  prediction_count?: number;
  average_delay_probability?: number;
  average_delay_probability_percentage?: number;
  average_predicted_delay_hours?: number;
  average_risk_score?: number;
  critical_count?: number;
  high_count?: number;
  medium_count?: number;
  low_count?: number;
};

type RiskLevel = {
  risk_level: string;
  count?: number;
  average_probability?: number;
  average_probability_percentage?: number;
  average_delay_hours?: number;
  average_risk_score?: number;
};

type TopRiskShipment = {
  shipment_id: number;
  shipment_code: string;
  delay_probability?: number;
  delay_probability_percentage?: number;
  risk_score?: number;
  risk_level?: string;
  predicted_delay_hours?: number;
  prediction_reason?: string;
  status?: string;
};

type ForecastData = {
  system?: string;
  module?: string;
  status?: string;
  overall?: OverallData;
  ml?: MLData;
  monthly_shipments?: MonthlyShipment[];
  monthly_ml?: MonthlyML[];
  risk_levels?: RiskLevel[];
  top_risk_shipments?: TopRiskShipment[];
  timestamp?: string;
};

/* ============================================================
   API
============================================================ */

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:8000";

const API_URL = `${API_BASE}/api/v1/forecasting`;

/* ============================================================
   HELPERS
============================================================ */

function numberValue(value: unknown): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(
  value: unknown,
  digits = 0
): string {
  return numberValue(value).toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPercentage(value: unknown): string {
  return `${formatNumber(value, 2)}%`;
}

function riskLabel(score: number): string {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

function riskTextClass(score: number): string {
  if (score >= 75) return "text-red-400";
  if (score >= 50) return "text-orange-400";
  if (score >= 25) return "text-yellow-400";
  return "text-cyan-400";
}

function riskBgClass(score: number): string {
  if (score >= 75) {
    return "border-red-500/20 bg-red-500/[0.05]";
  }

  if (score >= 50) {
    return "border-orange-500/20 bg-orange-500/[0.05]";
  }

  if (score >= 25) {
    return "border-yellow-500/20 bg-yellow-500/[0.05]";
  }

  return "border-cyan-500/20 bg-cyan-500/[0.05]";
}

function riskBarClass(score: number): string {
  if (score >= 75) return "bg-red-400";
  if (score >= 50) return "bg-orange-400";
  if (score >= 25) return "bg-yellow-400";
  return "bg-cyan-400";
}

function formatMonth(month: string): string {
  if (!month) return "Unknown";

  const [year, monthNumber] = month.split("-");

  if (!year || !monthNumber) return month;

  const date = new Date(
    Number(year),
    Number(monthNumber) - 1,
    1
  );

  return date.toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

function statusClass(status: string): string {
  const normalized = String(status || "").toUpperCase();

  if (normalized === "DELAYED") {
    return "border-red-500/20 bg-red-500/[0.06] text-red-300";
  }

  if (normalized === "DELIVERED") {
    return "border-cyan-500/20 bg-cyan-500/[0.06] text-cyan-300";
  }

  if (normalized === "IN_TRANSIT") {
    return "border-yellow-500/20 bg-yellow-500/[0.06] text-yellow-300";
  }

  return "border-white/[0.08] bg-white/[0.03] text-slate-400";
}

/* ============================================================
   MAIN PAGE
============================================================ */

export default function ForecastingPage() {
  const [data, setData] =
    useState<ForecastData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [selectedMonth, setSelectedMonth] =
    useState<string | null>(null);

  /* ============================================================
     LOAD DATA
  ============================================================ */

  const loadData = useCallback(
    async (manual = false) => {
      try {
        if (manual) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const response = await fetch(API_URL, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(
            `Forecasting API returned HTTP ${response.status}`
          );
        }

        const result: ForecastData =
          await response.json();

        setData(result);

        if (
          !selectedMonth &&
          result.monthly_shipments &&
          result.monthly_shipments.length > 0
        ) {
          setSelectedMonth(
            result.monthly_shipments[
              result.monthly_shipments.length - 1
            ].month
          );
        }
      } catch (err) {
        console.error(
          "Forecasting Intelligence API error:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Unable to connect to Forecasting API."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedMonth]
  );

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  /* ============================================================
     DATA SHORTCUTS
  ============================================================ */

  const overall = data?.overall;
  const ml = data?.ml;

  const monthlyShipments =
    data?.monthly_shipments ?? [];

  const monthlyML =
    data?.monthly_ml ?? [];

  const riskLevels =
    data?.risk_levels ?? [];

  const topRiskShipments =
    data?.top_risk_shipments ?? [];

  /* ============================================================
     MONTHLY MERGED DATA
  ============================================================ */

  const monthlyData = useMemo(() => {
    const shipmentMap = new Map<
      string,
      MonthlyShipment
    >();

    monthlyShipments.forEach((item) => {
      shipmentMap.set(item.month, item);
    });

    const mlMap = new Map<string, MonthlyML>();

    monthlyML.forEach((item) => {
      mlMap.set(item.month, item);
    });

    const months = Array.from(
      new Set([
        ...monthlyShipments.map(
          (item) => item.month
        ),
        ...monthlyML.map(
          (item) => item.month
        ),
      ])
    ).sort();

    return months.map((month) => ({
      month,
      shipments:
        shipmentMap.get(month)?.shipment_count ?? 0,
      delayed:
        shipmentMap.get(month)?.delayed_count ?? 0,
      delivered:
        shipmentMap.get(month)?.delivered_count ?? 0,
      delayPercentage:
        shipmentMap.get(month)?.delay_percentage ?? 0,
      predictionCount:
        mlMap.get(month)?.prediction_count ?? 0,
      averageRisk:
        mlMap.get(month)?.average_risk_score ?? 0,
      averageDelayProbability:
        mlMap.get(month)
          ?.average_delay_probability_percentage ??
        0,
      averageDelayHours:
        mlMap.get(month)
          ?.average_predicted_delay_hours ?? 0,
      critical:
        mlMap.get(month)?.critical_count ?? 0,
      high:
        mlMap.get(month)?.high_count ?? 0,
      medium:
        mlMap.get(month)?.medium_count ?? 0,
      low:
        mlMap.get(month)?.low_count ?? 0,
    }));
  }, [monthlyShipments, monthlyML]);

  const selectedMonthData = useMemo(() => {
    if (!selectedMonth) {
      return monthlyData.at(-1) ?? null;
    }

    return (
      monthlyData.find(
        (item) => item.month === selectedMonth
      ) ??
      monthlyData.at(-1) ??
      null
    );
  }, [monthlyData, selectedMonth]);

  /* ============================================================
     TREND
  ============================================================ */

  const riskTrend = useMemo(() => {
    if (monthlyData.length < 2) {
      return 0;
    }

    const previous =
      monthlyData[monthlyData.length - 2]
        .averageRisk;

    const current =
      monthlyData[monthlyData.length - 1]
        .averageRisk;

    return current - previous;
  }, [monthlyData]);

  const delayTrend = useMemo(() => {
    if (monthlyData.length < 2) {
      return 0;
    }

    const previous =
      monthlyData[monthlyData.length - 2]
        .delayPercentage;

    const current =
      monthlyData[monthlyData.length - 1]
        .delayPercentage;

    return current - previous;
  }, [monthlyData]);

  /* ============================================================
     RENDER
  ============================================================ */

  return (
    <main className="min-h-screen bg-[#05080d] text-white">
      {/* ======================================================
          HEADER
      ====================================================== */}

      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#05080d]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4 lg:px-8">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-400">
              <BrainCircuit size={14} />
              LogiShield Intelligence
            </div>

            <h1 className="mt-1 text-xl font-semibold tracking-tight lg:text-2xl">
              Forecasting Intelligence
            </h1>

            <p className="mt-1 text-xs text-slate-500">
              Predictive shipment delay and network risk analysis
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] px-4 py-2.5 md:flex">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-40" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400" />
              </span>

              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-cyan-300">
                {error
                  ? "API Offline"
                  : "Forecast Engine Live"}
              </span>
            </div>

            <button
              type="button"
              onClick={() => loadData(true)}
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

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400 text-xs font-black text-[#061014]">
              LS
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-6 py-8 lg:px-8">
        {/* ====================================================
            HERO
        ==================================================== */}

        <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#0b1116] via-[#080d11] to-[#0a1114] p-7 lg:p-9">
          <div className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-cyan-400/[0.05] blur-3xl" />

          <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-4xl">
              <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-400">
                <Activity size={13} />
                Predictive Network Intelligence
              </div>

              <h2 className="text-3xl font-semibold tracking-tight text-white lg:text-4xl">
                Predict disruption before it becomes an operational problem.
              </h2>

              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 lg:text-base">
                LogiShield analyzes shipment history, ML delay
                predictions and risk signals to identify emerging
                disruption patterns across the logistics network.
              </p>

              {data?.timestamp && (
                <div className="mt-5 flex items-center gap-2 text-[10px] text-slate-600">
                  <Clock3 size={12} />
                  Last synchronized{" "}
                  {new Date(
                    data.timestamp
                  ).toLocaleString("en-IN")}
                </div>
              )}
            </div>

            <div className="hidden h-28 w-28 shrink-0 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/[0.03] lg:flex">
              <div className="flex flex-col items-center gap-2">
                <BrainCircuit
                  size={30}
                  className="text-cyan-400"
                />

                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-300">
                  ML Active
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
                Unable to load Forecasting Intelligence
              </p>

              <p className="mt-1 text-xs text-red-400/70">
                {error}
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadData(true)}
              className="ml-auto shrink-0 rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/10"
            >
              Retry
            </button>
          </section>
        )}

        {/* ====================================================
            LOADING
        ==================================================== */}

        {loading && (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map(
              (_, index) => (
                <div
                  key={index}
                  className="h-36 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]"
                />
              )
            )}
          </div>
        )}

        {/* ====================================================
            DATA
        ==================================================== */}

        {!loading && data && (
          <>
            {/* ==================================================
                KPI GRID
            ================================================== */}

            <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <Kpi
                icon={<BrainCircuit size={19} />}
                title="ML Predictions"
                value={formatNumber(
                  ml?.prediction_count
                )}
                caption="Shipments evaluated by model"
              />

              <Kpi
                icon={<AlertTriangle size={19} />}
                title="Critical Predictions"
                value={formatNumber(
                  ml?.critical_predictions
                )}
                caption="Immediate intervention candidates"
                danger
              />

              <Kpi
                icon={<TrendingUp size={19} />}
                title="High Risk"
                value={formatNumber(
                  ml?.high_predictions
                )}
                caption="Elevated disruption exposure"
                warning
              />

              <Kpi
                icon={<Shield size={19} />}
                title="Average Risk"
                value={formatPercentage(
                  ml?.average_delay_probability_percentage
                )}
                caption="Network-wide delay probability"
              />

              <Kpi
                icon={<Clock3 size={19} />}
                title="Avg Predicted Delay"
                value={`${formatNumber(
                  ml?.average_predicted_delay_hours,
                  2
                )}h`}
                caption="Expected delay duration"
              />
            </section>

            {/* ==================================================
                TREND SIGNALS
            ================================================== */}

            <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SignalCard
                icon={<Truck size={18} />}
                title="Total Shipments"
                value={formatNumber(
                  overall?.total_shipments
                )}
                description="Shipments represented in the forecasting dataset."
              />

              <SignalCard
                icon={<CheckCircle2 size={18} />}
                title="Delivered"
                value={formatNumber(
                  overall?.delivered_shipments
                )}
                description="Shipments successfully delivered."
              />

              <SignalCard
                icon={<AlertTriangle size={18} />}
                title="Delayed"
                value={formatNumber(
                  overall?.delayed_shipments
                )}
                description={`${formatPercentage(
                  overall?.total_shipments
                    ? (numberValue(
                        overall.delayed_shipments
                      ) /
                        numberValue(
                          overall.total_shipments
                        )) *
                        100
                    : 0
                )} of total shipments are delayed.`}
                danger
              />

              <SignalCard
                icon={
                  delayTrend <= 0 ? (
                    <TrendingDown size={18} />
                  ) : (
                    <TrendingUp size={18} />
                  )
                }
                title="Latest Delay Trend"
                value={`${
                  delayTrend > 0 ? "+" : ""
                }${formatNumber(delayTrend, 2)}%`}
                description={
                  delayTrend > 0
                    ? "Latest monthly delay rate increased."
                    : delayTrend < 0
                    ? "Latest monthly delay rate improved."
                    : "Latest monthly delay rate is stable."
                }
                warning={delayTrend > 0}
              />
            </section>

            {/* ==================================================
                MAIN ANALYTICS
            ================================================== */}

            <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
              {/* MONTHLY FORECAST */}

              <div className="rounded-2xl border border-white/[0.08] bg-[#070c10] p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-400">
                      Forecast Trend
                    </div>

                    <h2 className="mt-2 text-xl font-semibold">
                      Monthly shipment risk
                    </h2>

                    <p className="mt-1 text-xs text-slate-500">
                      Historical delay rate and ML risk probability
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-[10px] text-slate-500">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-cyan-400" />
                      Delay %
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-orange-400" />
                      ML Risk %
                    </div>
                  </div>
                </div>

                {monthlyData.length === 0 ? (
                  <EmptyState message="No monthly forecasting data available." />
                ) : (
                  <div className="mt-8">
                    <div className="flex h-72 items-end gap-2 overflow-x-auto pb-8">
                      {monthlyData.map((item) => {
                        const shipmentHeight =
                          Math.max(
                            5,
                            Math.min(
                              100,
                              item.delayPercentage
                            )
                          );

                        const mlHeight =
                          Math.max(
                            5,
                            Math.min(
                              100,
                              item.averageRisk
                            )
                          );

                        const selected =
                          selectedMonth ===
                          item.month;

                        return (
                          <button
                            key={item.month}
                            type="button"
                            onClick={() =>
                              setSelectedMonth(
                                item.month
                              )
                            }
                            className={`group relative flex h-full min-w-[58px] flex-1 flex-col justify-end rounded-lg px-1 transition ${
                              selected
                                ? "bg-white/[0.035]"
                                : "hover:bg-white/[0.02]"
                            }`}
                          >
                            <div className="relative flex h-56 items-end justify-center gap-1">
                              <div
                                className="w-3 rounded-t-md bg-cyan-400/80 transition group-hover:bg-cyan-300"
                                style={{
                                  height: `${shipmentHeight}%`,
                                }}
                              />

                              <div
                                className="w-3 rounded-t-md bg-orange-400/80 transition group-hover:bg-orange-300"
                                style={{
                                  height: `${mlHeight}%`,
                                }}
                              />

                              <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden w-36 -translate-x-1/2 rounded-lg border border-white/[0.08] bg-[#0a1015] p-3 text-left shadow-xl group-hover:block">
                                <p className="text-[10px] font-bold text-white">
                                  {formatMonth(
                                    item.month
                                  )}
                                </p>

                                <p className="mt-2 text-[10px] text-cyan-300">
                                  Delay:{" "}
                                  {formatNumber(
                                    item.delayPercentage,
                                    2
                                  )}
                                  %
                                </p>

                                <p className="mt-1 text-[10px] text-orange-300">
                                  ML Risk:{" "}
                                  {formatNumber(
                                    item.averageRisk,
                                    2
                                  )}
                                  %
                                </p>

                                <p className="mt-1 text-[10px] text-slate-500">
                                  Shipments:{" "}
                                  {formatNumber(
                                    item.shipments
                                  )}
                                </p>
                              </div>
                            </div>

                            <span
                              className={`mt-3 whitespace-nowrap text-[9px] ${
                                selected
                                  ? "font-bold text-cyan-300"
                                  : "text-slate-600"
                              }`}
                            >
                              {formatMonth(
                                item.month
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* SELECTED MONTH */}

              <div className="rounded-2xl border border-white/[0.08] bg-[#070c10] p-6">
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-orange-400">
                  Forecast Snapshot
                </div>

                <h2 className="mt-2 text-xl font-semibold">
                  {selectedMonthData
                    ? formatMonth(
                        selectedMonthData.month
                      )
                    : "Current Period"}
                </h2>

                {selectedMonthData ? (
                  <div className="mt-6 space-y-5">
                    <MetricRow
                      label="Shipments"
                      value={formatNumber(
                        selectedMonthData.shipments
                      )}
                    />

                    <MetricRow
                      label="Delayed"
                      value={formatNumber(
                        selectedMonthData.delayed
                      )}
                      danger
                    />

                    <MetricRow
                      label="Delay Rate"
                      value={formatPercentage(
                        selectedMonthData.delayPercentage
                      )}
                    />

                    <MetricRow
                      label="ML Risk"
                      value={formatPercentage(
                        selectedMonthData.averageRisk
                      )}
                      danger={
                        selectedMonthData.averageRisk >=
                        50
                      }
                    />

                    <MetricRow
                      label="Predicted Delay"
                      value={`${formatNumber(
                        selectedMonthData.averageDelayHours,
                        2
                      )}h`}
                    />

                    <MetricRow
                      label="Critical"
                      value={formatNumber(
                        selectedMonthData.critical
                      )}
                      danger
                    />
                  </div>
                ) : (
                  <EmptyState message="Select a month to inspect forecast signals." />
                )}
              </div>
            </section>

            {/* ==================================================
                RISK DISTRIBUTION + NETWORK OVERVIEW
            ================================================== */}

            <section className="mt-6 grid gap-6 xl:grid-cols-2">
              {/* RISK DISTRIBUTION */}

              <div className="rounded-2xl border border-white/[0.08] bg-[#070c10] p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-400">
                      Model Signal
                    </div>

                    <h2 className="mt-2 text-xl font-semibold">
                      Risk distribution
                    </h2>

                    <p className="mt-1 text-xs text-slate-500">
                      ML prediction classification across the network
                    </p>
                  </div>

                  <BarChart3
                    size={21}
                    className="text-red-400"
                  />
                </div>

                <div className="mt-7 space-y-5">
                  {riskLevels.length === 0 ? (
                    <EmptyState message="No risk-level data available." />
                  ) : (
                    riskLevels.map((item) => {
                      const count =
                        numberValue(
                          item.count
                        );

                      const total =
                        numberValue(
                          ml?.prediction_count
                        );

                      const percentage =
                        total > 0
                          ? (count / total) * 100
                          : 0;

                      const score =
                        numberValue(
                          item.average_risk_score
                        );

                      return (
                        <div key={item.risk_level}>
                          <div className="mb-2 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span
                                className={`h-2.5 w-2.5 rounded-full ${riskBarClass(
                                  score
                                )}`}
                              />

                              <span className="text-xs font-medium text-slate-300">
                                {item.risk_level}
                              </span>
                            </div>

                            <div className="flex items-center gap-3">
                              <span
                                className={`text-xs font-bold ${riskTextClass(
                                  score
                                )}`}
                              >
                                {formatNumber(
                                  count
                                )}
                              </span>

                              <span className="text-[10px] text-slate-600">
                                {formatNumber(
                                  percentage,
                                  1
                                )}
                                %
                              </span>
                            </div>
                          </div>

                          <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                            <div
                              className={`h-full rounded-full ${riskBarClass(
                                score
                              )}`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  percentage
                                )}%`,
                              }}
                            />
                          </div>

                          <div className="mt-2 flex justify-between text-[9px] text-slate-600">
                            <span>
                              Avg probability{" "}
                              {formatPercentage(
                                item.average_probability_percentage
                              )}
                            </span>

                            <span>
                              Avg delay{" "}
                              {formatNumber(
                                item.average_delay_hours,
                                2
                              )}
                              h
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* NETWORK OVERVIEW */}

              <div className="rounded-2xl border border-white/[0.08] bg-[#070c10] p-6">
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-400">
                  Shipment Forecast
                </div>

                <h2 className="mt-2 text-xl font-semibold">
                  Network shipment overview
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Current operational distribution
                </p>

                <div className="mt-7 grid grid-cols-2 gap-3">
                  <MiniMetric
                    label="Total"
                    value={formatNumber(
                      overall?.total_shipments
                    )}
                  />

                  <MiniMetric
                    label="Delivered"
                    value={formatNumber(
                      overall?.delivered_shipments
                    )}
                  />

                  <MiniMetric
                    label="Delayed"
                    value={formatNumber(
                      overall?.delayed_shipments
                    )}
                    danger
                  />

                  <MiniMetric
                    label="In Transit"
                    value={formatNumber(
                      overall?.in_transit_shipments
                    )}
                  />

                  <MiniMetric
                    label="Cancelled"
                    value={formatNumber(
                      overall?.cancelled_shipments
                    )}
                  />

                  <MiniMetric
                    label="Actual Avg Delay"
                    value={`${formatNumber(
                      overall?.average_actual_delay_hours,
                      2
                    )}h`}
                  />
                </div>

                <div className="mt-5 rounded-xl border border-cyan-500/15 bg-cyan-500/[0.025] p-4">
                  <div className="flex items-start gap-3">
                    <Shield
                      size={17}
                      className="mt-0.5 shrink-0 text-cyan-400"
                    />

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-400">
                        Forecast Signal
                      </p>

                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        The model currently evaluates{" "}
                        <span className="font-semibold text-white">
                          {formatNumber(
                            ml?.prediction_count
                          )}
                        </span>{" "}
                        shipment predictions with an
                        average delay probability of{" "}
                        <span className="font-semibold text-cyan-300">
                          {formatPercentage(
                            ml?.average_delay_probability_percentage
                          )}
                        </span>
                        .
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ==================================================
                TOP RISK SHIPMENTS
            ================================================== */}

            <section className="mt-6 rounded-2xl border border-white/[0.08] bg-[#070c10] p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-400">
                    Exposure Watch
                  </div>

                  <h2 className="mt-2 text-xl font-semibold">
                    Highest-risk shipments
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    Shipments with the strongest predicted delay exposure
                  </p>
                </div>

                <div className="flex items-center gap-2 rounded-lg border border-red-500/15 bg-red-500/[0.04] px-3 py-2">
                  <AlertTriangle
                    size={14}
                    className="text-red-400"
                  />

                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-red-300">
                    Priority Queue
                  </span>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left">
                      <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">
                        Shipment
                      </th>

                      <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">
                        Risk
                      </th>

                      <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">
                        Predicted Delay
                      </th>

                      <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">
                        Status
                      </th>

                      <th className="px-3 py-3 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">
                        Prediction Reason
                      </th>

                      <th className="px-3 py-3 text-right text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {topRiskShipments.length ===
                    0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-3 py-12 text-center"
                        >
                          <EmptyState message="No high-risk shipment data available." />
                        </td>
                      </tr>
                    ) : (
                      topRiskShipments.map(
                        (shipment, index) => {
                          const risk =
                            numberValue(
                              shipment.risk_score
                            );

                          return (
                            <tr
                              key={
                                shipment.shipment_id
                              }
                              className="border-b border-white/[0.04] transition hover:bg-white/[0.02]"
                            >
                              <td className="px-3 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-400/[0.06] text-[10px] font-bold text-red-300">
                                    {String(
                                      index + 1
                                    ).padStart(
                                      2,
                                      "0"
                                    )}
                                  </div>

                                  <div>
                                    <div className="font-mono text-xs font-semibold text-white">
                                      {
                                        shipment.shipment_code
                                      }
                                    </div>

                                    <div className="mt-1 text-[9px] text-slate-600">
                                      ID #
                                      {
                                        shipment.shipment_id
                                      }
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="px-3 py-4">
                                <div className="w-28">
                                  <div className="mb-1 flex items-center justify-between">
                                    <span
                                      className={`text-xs font-bold ${riskTextClass(
                                        risk
                                      )}`}
                                    >
                                      {formatNumber(
                                        shipment.delay_probability_percentage ??
                                          risk,
                                        2
                                      )}
                                      %
                                    </span>

                                    <span className="text-[8px] text-slate-700">
                                      {shipment.risk_level ||
                                        riskLabel(
                                          risk
                                        )}
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

                              <td className="px-3 py-4">
                                <div className="flex items-center gap-2 text-xs text-slate-300">
                                  <Clock3
                                    size={13}
                                    className="text-slate-600"
                                  />

                                  {formatNumber(
                                    shipment.predicted_delay_hours,
                                    2
                                  )}
                                  h
                                </div>
                              </td>

                              <td className="px-3 py-4">
                                <span
                                  className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] ${statusClass(
                                    shipment.status ||
                                      ""
                                  )}`}
                                >
                                  {shipment.status ||
                                    "UNKNOWN"}
                                </span>
                              </td>

                              <td className="max-w-[350px] px-3 py-4">
                                <p className="line-clamp-2 text-[10px] leading-5 text-slate-500">
                                  {
                                    shipment.prediction_reason
                                  }
                                </p>
                              </td>

                              <td className="px-3 py-4 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    window.location.href = `/shipments?shipment=${encodeURIComponent(
                                      shipment.shipment_code
                                    )}`
                                  }
                                  className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[10px] font-medium text-slate-300 transition hover:border-cyan-400/25 hover:bg-cyan-400/[0.04] hover:text-cyan-300"
                                >
                                  Inspect
                                  <ArrowRight
                                    size={12}
                                  />
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
            </section>

            {/* ==================================================
                MODEL TELEMETRY
            ================================================== */}

            <section className="mt-6 rounded-2xl border border-white/[0.08] bg-[#070c10] p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-400">
                    Model Telemetry
                  </div>

                  <h2 className="mt-2 text-xl font-semibold">
                    Forecasting performance signals
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    Aggregate model outputs from the current prediction run
                  </p>
                </div>

                <BrainCircuit
                  size={21}
                  className="text-cyan-400"
                />
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Telemetry
                  title="Average Risk Score"
                  value={formatNumber(
                    ml?.average_risk_score,
                    2
                  )}
                />

                <Telemetry
                  title="Maximum Risk Score"
                  value={formatNumber(
                    ml?.maximum_risk_score,
                    2
                  )}
                  danger
                />

                <Telemetry
                  title="Maximum Predicted Delay"
                  value={`${formatNumber(
                    ml?.maximum_predicted_delay_hours,
                    2
                  )}h`}
                  danger
                />

                <Telemetry
                  title="Actual Avg Delay"
                  value={`${formatNumber(
                    overall?.average_actual_delay_hours,
                    2
                  )}h`}
                />
              </div>
            </section>

            {/* ==================================================
                DECISION SIGNAL
            ================================================== */}

            <section className="mt-6 rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.025] p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-400/[0.08] text-cyan-400">
                    <Shield size={20} />
                  </div>

                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
                      Intelligence Signal
                    </div>

                    <h3 className="mt-1 text-lg font-semibold">
                      Forecasting is ready for operational decisioning.
                    </h3>

                    <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-500">
                      High-risk shipments identified by the forecasting
                      engine can now feed the Route Intelligence and
                      Recovery Decision Engine for intervention planning.
                    </p>
                  </div>
                </div>

                <div className="shrink-0 rounded-xl border border-cyan-500/15 bg-black/10 px-5 py-4">
                  <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600">
                    Highest Risk
                  </div>

                  <div className="mt-1 font-mono text-sm font-semibold text-cyan-300">
                    {topRiskShipments[0]
                      ?.shipment_code ||
                      "N/A"}
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    {formatPercentage(
                      topRiskShipments[0]
                        ?.delay_probability_percentage
                    )}{" "}
                    delay probability
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

/* ============================================================
   KPI
============================================================ */

function Kpi({
  icon,
  title,
  value,
  caption,
  danger = false,
  warning = false,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  caption: string;
  danger?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 transition ${
        danger
          ? "border-red-500/20 bg-red-500/[0.03]"
          : warning
          ? "border-orange-500/20 bg-orange-500/[0.03]"
          : "border-white/[0.08] bg-[#070c10]"
      }`}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          danger
            ? "bg-red-400/[0.08] text-red-400"
            : warning
            ? "bg-orange-400/[0.08] text-orange-400"
            : "bg-cyan-400/[0.08] text-cyan-400"
        }`}
      >
        {icon}
      </div>

      <div
        className={`mt-6 text-2xl font-semibold tracking-tight ${
          danger
            ? "text-red-300"
            : warning
            ? "text-orange-300"
            : "text-cyan-300"
        }`}
      >
        {value}
      </div>

      <div className="mt-1 text-xs font-medium text-slate-300">
        {title}
      </div>

      <div className="mt-2 text-[10px] leading-4 text-slate-600">
        {caption}
      </div>
    </div>
  );
}

/* ============================================================
   SIGNAL CARD
============================================================ */

function SignalCard({
  icon,
  title,
  value,
  description,
  danger = false,
  warning = false,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  description: string;
  danger?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#070c10] p-5">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          danger
            ? "bg-red-400/[0.08] text-red-400"
            : warning
            ? "bg-orange-400/[0.08] text-orange-400"
            : "bg-cyan-400/[0.08] text-cyan-400"
        }`}
      >
        {icon}
      </div>

      <div
        className={`mt-5 text-2xl font-semibold ${
          danger
            ? "text-red-300"
            : warning
            ? "text-orange-300"
            : "text-white"
        }`}
      >
        {value}
      </div>

      <div className="mt-1 text-xs font-medium text-slate-300">
        {title}
      </div>

      <p className="mt-3 text-[10px] leading-5 text-slate-600">
        {description}
      </p>
    </div>
  );
}

/* ============================================================
   METRIC ROW
============================================================ */

function MetricRow({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.05] pb-4">
      <span className="text-xs text-slate-500">
        {label}
      </span>

      <span
        className={`text-sm font-semibold ${
          danger
            ? "text-red-300"
            : "text-slate-200"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/* ============================================================
   MINI METRIC
============================================================ */

function MiniMetric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600">
        {label}
      </div>

      <div
        className={`mt-3 text-xl font-semibold ${
          danger
            ? "text-red-300"
            : "text-slate-200"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/* ============================================================
   TELEMETRY
============================================================ */

function Telemetry({
  title,
  value,
  danger = false,
}: {
  title: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-600">
        {title}
      </p>

      <p
        className={`mt-4 text-2xl font-bold ${
          danger
            ? "text-red-300"
            : "text-cyan-300"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/* ============================================================
   EMPTY STATE
============================================================ */

function EmptyState({
  message,
}: {
  message: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-8 text-center">
      <BarChart3
        size={24}
        className="mx-auto text-slate-700"
      />

      <p className="mt-3 text-xs text-slate-600">
        {message}
      </p>
    </div>
  );
}