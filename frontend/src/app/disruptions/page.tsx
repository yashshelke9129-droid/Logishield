"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CloudRain,
  MapPin,
  RefreshCw,
  ShieldAlert,
  TrafficCone,
  Truck,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

type DisruptionType = {
  disruption_type: string;
  occurrences: number;
};

type DashboardResponse = {
  disruptions?: {
    total?: number;
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
    top_types?: DisruptionType[];
  };

  routes?: {
    total?: number;
    open?: number;
    unavailable?: number;
  };

  timestamp?: string;
};

function formatNumber(value?: number) {
  if (
    value === undefined ||
    value === null
  ) {
    return "0";
  }

  return Number(value).toLocaleString(
    "en-IN"
  );
}

function formatType(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function getDisruptionIcon(
  type: string
) {
  const normalized =
    type.toUpperCase();

  if (
    normalized.includes("RAIN") ||
    normalized.includes("STORM") ||
    normalized.includes("WEATHER")
  ) {
    return <CloudRain size={19} />;
  }

  if (
    normalized.includes("TRAFFIC") ||
    normalized.includes("CONGESTION")
  ) {
    return <TrafficCone size={19} />;
  }

  if (
    normalized.includes("VEHICLE") ||
    normalized.includes("BREAKDOWN")
  ) {
    return <Truck size={19} />;
  }

  if (
    normalized.includes("ROAD") ||
    normalized.includes("CLOSURE")
  ) {
    return <MapPin size={19} />;
  }

  return <Zap size={19} />;
}

export default function DisruptionsPage() {
  const [data, setData] =
    useState<DashboardResponse | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [refreshing, setRefreshing] =
    useState(false);

  async function loadDisruptions(
    manual = false
  ) {
    try {
      if (manual) {
        setRefreshing(true);
      }

      setError("");

      const response = await fetch(
        `${API_BASE_URL}/api/v1/dashboard/overview`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(
          `API returned ${response.status}`
        );
      }

      const result =
        await response.json();

      setData(result);
    } catch (err) {
      console.error(
        "Disruption API error:",
        err
      );

      setError(
        "Unable to load live disruption data."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadDisruptions();

    const interval = setInterval(
      () => loadDisruptions(),
      30000
    );

    return () =>
      clearInterval(interval);
  }, []);

  const disruptions =
    data?.disruptions || {};

  const total =
    disruptions.total || 0;

  const critical =
    disruptions.critical || 0;

  const high =
    disruptions.high || 0;

  const medium =
    disruptions.medium || 0;

  const low =
    disruptions.low || 0;

  const topTypes =
    disruptions.top_types || [];

  const routes =
    data?.routes || {};

  const maxOccurrences =
    Math.max(
      ...topTypes.map(
        (item) => item.occurrences
      ),
      1
    );

  return (
    <main className="min-h-screen bg-[#05080d] text-white">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="sticky top-0 z-40 flex h-[82px] items-center justify-between border-b border-white/[0.06] bg-[#05080d]/95 px-8 backdrop-blur-xl">

        <div className="flex items-center gap-4">

          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.02] text-slate-400 transition hover:border-cyan-300/20 hover:text-cyan-300"
          >
            <ArrowLeft size={18} />
          </Link>

          <div>

            <div className="text-[8px] font-bold tracking-[0.18em] text-cyan-300/60">
              LOGISHIELD OPERATIONS
            </div>

            <h1 className="mt-1 text-xl font-medium tracking-tight text-slate-100">
              Disruption Intelligence
            </h1>

          </div>

        </div>

        <div className="flex items-center gap-3">

          <div className="flex items-center gap-2 rounded-lg border border-cyan-300/10 bg-cyan-300/[0.035] px-3 py-2">

            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(94,234,212,0.8)]" />

            <span className="text-[8px] font-bold tracking-[0.1em] text-cyan-300">
              {error
                ? "API OFFLINE"
                : "LIVE DATA"}
            </span>

          </div>

          <button
            type="button"
            onClick={() =>
              loadDisruptions(true)
            }
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-slate-400 transition hover:border-cyan-300/20 hover:text-cyan-300 disabled:opacity-50"
          >

            <RefreshCw
              size={14}
              className={
                refreshing
                  ? "animate-spin"
                  : ""
              }
            />

            Refresh

          </button>

          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-300 text-[9px] font-black text-[#071014]">
            LS
          </div>

        </div>

      </header>

      {/* =====================================================
          MAIN CONTENT
      ===================================================== */}

      <div className="mx-auto max-w-[1700px] p-8">

        {/* ===================================================
            HERO
        =================================================== */}

        <section className="relative overflow-hidden rounded-2xl border border-red-400/10 bg-gradient-to-br from-red-400/[0.055] via-[#0b1118] to-[#071018] p-8">

          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-red-400/[0.035] blur-3xl" />

          <div className="relative flex items-center justify-between gap-10">

            <div>

              <div className="text-[8px] font-bold tracking-[0.18em] text-red-300/60">
                NETWORK DISRUPTION CONTROL
              </div>

              <h2 className="mt-3 max-w-4xl text-3xl font-medium tracking-tight text-slate-100">
                Detect and understand threats
                across the logistics network.
              </h2>

              <p className="mt-4 max-w-3xl text-xs leading-6 text-slate-500">
                Monitor weather, traffic,
                vehicle, route and operational
                disruptions affecting the
                LogiShield network.
              </p>

            </div>

            <div className="hidden h-28 w-28 items-center justify-center rounded-full border border-red-400/20 bg-red-400/[0.025] lg:flex">

              <div className="text-center">

                <div className="text-2xl font-bold text-red-300">
                  {loading
                    ? "--"
                    : formatNumber(total)}
                </div>

                <div className="mt-1 text-[7px] font-bold tracking-[0.12em] text-slate-600">
                  EVENTS
                </div>

              </div>

            </div>

          </div>

        </section>

        {/* ===================================================
            STAT CARDS
        =================================================== */}

        <section className="mt-5 grid grid-cols-4 gap-4">

          <DisruptionMetric
            icon={
              <ShieldAlert size={19} />
            }
            label="Critical"
            value={critical}
            danger
            description="Immediate attention"
          />

          <DisruptionMetric
            icon={
              <AlertTriangle size={19} />
            }
            label="High"
            value={high}
            warning
            description="Significant exposure"
          />

          <DisruptionMetric
            icon={
              <Zap size={19} />
            }
            label="Medium"
            value={medium}
            description="Monitor closely"
          />

          <DisruptionMetric
            icon={
              <CloudRain size={19} />
            }
            label="Low"
            value={low}
            description="Low operational impact"
          />

        </section>

        {/* ===================================================
            ERROR
        =================================================== */}

        {error && (
          <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/[0.05] p-4 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* ===================================================
            MAIN ANALYTICS
        =================================================== */}

        <section className="mt-5 grid grid-cols-[minmax(0,1.6fr)_minmax(360px,1fr)] gap-5">

          {/* =================================================
              DISRUPTION TYPES
          ================================================= */}

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">

            <div className="flex items-center justify-between">

              <div>

                <div className="text-[8px] font-bold tracking-[0.18em] text-slate-600">
                  EVENT DISTRIBUTION
                </div>

                <h3 className="mt-2 text-sm font-medium text-slate-200">
                  Disruption Types
                </h3>

              </div>

              <div className="text-[8px] text-slate-600">
                Top network events
              </div>

            </div>

            <div className="mt-7 space-y-5">

              {loading ? (

                <div className="flex h-64 items-center justify-center text-xs text-slate-600">
                  Loading disruption data...
                </div>

              ) : topTypes.length === 0 ? (

                <div className="flex h-64 items-center justify-center text-xs text-slate-600">
                  No disruption data available.
                </div>

              ) : (

                topTypes
                  .slice(0, 10)
                  .map(
                    (
                      disruption,
                      index
                    ) => {

                      const percentage =
                        (disruption.occurrences /
                          maxOccurrences) *
                        100;

                      return (
                        <div
                          key={`${disruption.disruption_type}-${index}`}
                        >

                          <div className="flex items-center justify-between">

                            <div className="flex items-center gap-3">

                              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/10 bg-cyan-300/[0.035] text-cyan-300">
                                {getDisruptionIcon(
                                  disruption.disruption_type
                                )}
                              </div>

                              <div>

                                <div className="text-[10px] font-semibold text-slate-300">
                                  {formatType(
                                    disruption.disruption_type
                                  )}
                                </div>

                                <div className="mt-1 text-[7px] text-slate-600">
                                  Network occurrence #{index + 1}
                                </div>

                              </div>

                            </div>

                            <div className="text-right">

                              <div className="text-[11px] font-bold text-slate-200">
                                {formatNumber(
                                  disruption.occurrences
                                )}
                              </div>

                              <div className="text-[7px] text-slate-600">
                                occurrences
                              </div>

                            </div>

                          </div>

                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.04]">

                            <div
                              className="h-full rounded-full bg-cyan-300 transition-all duration-700"
                              style={{
                                width: `${percentage}%`,
                              }}
                            />

                          </div>

                        </div>
                      );
                    }
                  )

              )}

            </div>

          </div>

          {/* =================================================
              NETWORK IMPACT
          ================================================= */}

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">

            <div>

              <div className="text-[8px] font-bold tracking-[0.18em] text-slate-600">
                NETWORK IMPACT
              </div>

              <h3 className="mt-2 text-sm font-medium text-slate-200">
                Operational Exposure
              </h3>

            </div>

            <div className="mt-7 space-y-4">

              <ImpactRow
                label="Total disruptions"
                value={total}
                icon={
                  <ShieldAlert size={17} />
                }
              />

              <ImpactRow
                label="Critical events"
                value={critical}
                icon={
                  <AlertTriangle size={17} />
                }
                danger
              />

              <ImpactRow
                label="High-severity events"
                value={high}
                icon={
                  <Zap size={17} />
                }
              />

              <ImpactRow
                label="Unavailable routes"
                value={
                  routes.unavailable || 0
                }
                icon={
                  <MapPin size={17} />
                }
              />

            </div>

            {/* STATUS */}

            <div className="mt-7 rounded-xl border border-cyan-300/10 bg-cyan-300/[0.025] p-4">

              <div className="flex items-center gap-3">

                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-300">
                  <ShieldAlert
                    size={17}
                  />
                </div>

                <div>

                  <div className="text-[9px] font-bold text-slate-300">
                    DISRUPTION ENGINE
                  </div>

                  <div className="mt-1 text-[7px] text-cyan-300/60">
                    LIVE DATABASE ANALYSIS
                  </div>

                </div>

              </div>

            </div>

          </div>

        </section>

        {/* ===================================================
            SEVERITY MATRIX
        =================================================== */}

        <section className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-[8px] font-bold tracking-[0.18em] text-slate-600">
                SEVERITY MATRIX
              </div>

              <h3 className="mt-2 text-sm font-medium text-slate-200">
                Disruption Risk Profile
              </h3>

            </div>

            <div className="text-[8px] text-slate-600">
              Live PostgreSQL data
            </div>

          </div>

          <div className="mt-7 grid grid-cols-4 gap-5">

            <SeverityBlock
              label="CRITICAL"
              value={critical}
              percentage={
                total > 0
                  ? (critical / total) *
                    100
                  : 0
              }
              danger
            />

            <SeverityBlock
              label="HIGH"
              value={high}
              percentage={
                total > 0
                  ? (high / total) * 100
                  : 0
              }
              warning
            />

            <SeverityBlock
              label="MEDIUM"
              value={medium}
              percentage={
                total > 0
                  ? (medium / total) * 100
                  : 0
              }
            />

            <SeverityBlock
              label="LOW"
              value={low}
              percentage={
                total > 0
                  ? (low / total) * 100
                  : 0
              }
            />

          </div>

        </section>

        {/* ===================================================
            FOOTER
        =================================================== */}

        <footer className="mt-6 flex justify-between px-1 text-[7px] font-bold tracking-[0.1em] text-slate-700">

          <span>
            LOGISHIELD · DISRUPTION INTELLIGENCE
          </span>

          <span>
            API:{" "}
            {error
              ? "OFFLINE"
              : "CONNECTED"}{" "}
            · LIVE MONITORING
          </span>

        </footer>

      </div>

    </main>
  );
}

/* ============================================================
   DISRUPTION METRIC
============================================================ */

function DisruptionMetric({
  icon,
  label,
  value,
  description,
  danger = false,
  warning = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  description: string;
  danger?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white/[0.02] p-5 ${
        danger
          ? "border-red-400/20"
          : warning
          ? "border-yellow-300/15"
          : "border-white/[0.07]"
      }`}
    >

      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          danger
            ? "bg-red-400/10 text-red-300"
            : warning
            ? "bg-yellow-300/10 text-yellow-300"
            : "bg-cyan-300/[0.07] text-cyan-300"
        }`}
      >
        {icon}
      </div>

      <div className="mt-6 text-2xl font-bold text-slate-100">
        {formatNumber(value)}
      </div>

      <div className="mt-1 text-[10px] font-semibold text-slate-300">
        {label}
      </div>

      <div className="mt-2 text-[7px] text-slate-600">
        {description}
      </div>

    </div>
  );
}

/* ============================================================
   IMPACT ROW
============================================================ */

function ImpactRow({
  label,
  value,
  icon,
  danger = false,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">

      <div className="flex items-center gap-3">

        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${
            danger
              ? "bg-red-400/10 text-red-300"
              : "bg-cyan-300/[0.06] text-cyan-300"
          }`}
        >
          {icon}
        </div>

        <span className="text-[9px] font-medium text-slate-400">
          {label}
        </span>

      </div>

      <span className="text-sm font-bold text-slate-200">
        {formatNumber(value)}
      </span>

    </div>
  );
}

/* ============================================================
   SEVERITY BLOCK
============================================================ */

function SeverityBlock({
  label,
  value,
  percentage,
  danger = false,
  warning = false,
}: {
  label: string;
  value: number;
  percentage: number;
  danger?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">

      <div className="flex items-center justify-between">

        <span
          className={`text-[8px] font-bold tracking-[0.14em] ${
            danger
              ? "text-red-300"
              : warning
              ? "text-yellow-300"
              : "text-cyan-300"
          }`}
        >
          {label}
        </span>

        <span className="text-[8px] text-slate-600">
          {percentage.toFixed(1)}%
        </span>

      </div>

      <div className="mt-4 text-2xl font-bold text-slate-100">
        {formatNumber(value)}
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">

        <div
          className={`h-full rounded-full ${
            danger
              ? "bg-red-400"
              : warning
              ? "bg-yellow-300"
              : "bg-cyan-300"
          }`}
          style={{
            width: `${Math.min(
              percentage,
              100
            )}%`,
          }}
        />

      </div>

    </div>
  );
}