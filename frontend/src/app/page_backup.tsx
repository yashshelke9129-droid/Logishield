"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  CloudRain,
  Gauge,
  Map,
  Package,
  RefreshCw,
  Route,
  ShieldAlert,
  Truck,
  Waves,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

type RiskData = {
  critical: number;
  high: number;
  medium: number;
  low: number;
  average_delay_probability: number;
  average_delay_probability_percentage: number;
};

type DisruptionType = {
  disruption_type: string;
  occurrences: number;
};

type DisruptionData = {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  top_types: DisruptionType[];
};

type OverviewData = {
  system: string;
  dashboard: string;
  status: string;
  timestamp: string;

  overview: {
    total_shipments: number;
    delivered_shipments: number;
    delayed_shipments: number;
    in_transit_shipments: number;
    cancelled_shipments: number;
    delay_percentage: number;
  };

  risk: RiskData;

  disruptions: DisruptionData;

  routes: {
    total: number;
    open: number;
    unavailable: number;
    average_risk: number;
    average_distance_km: number;
  };

  vehicles: {
    total: number;
    available: number;
    active: number;
    unavailable: number;
    average_capacity_kg: number;
  };

  infrastructure: {
    warehouses: number;
    inventory_records: number;
    total_inventory_units: number;
  };

  recovery: {
    total_recovery_plans: number;
  };

  high_risk_shipments: HighRiskShipment[];
};

type HighRiskShipment = {
  shipment_id: number;
  shipment_code: string;
  source_location_id: number;
  source_city: string;
  destination_location_id: number;
  destination_city: string;
  status: string;
  delay_probability: number;
  delay_probability_percentage: number;
  risk_level: string;
};

/* ============================================================
   HELPERS
============================================================ */

function numberFormat(
  value: number | undefined | null
) {
  if (
    value === undefined ||
    value === null ||
    Number.isNaN(value)
  ) {
    return "0";
  }

  return Number(value).toLocaleString("en-IN");
}

function percentage(
  value: number | undefined | null
) {
  if (
    value === undefined ||
    value === null ||
    Number.isNaN(value)
  ) {
    return "0.0";
  }

  return Number(value).toFixed(1);
}

function formatDisruptionType(
  value: string
) {
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
    normalized.includes("CYCLONE")
  ) {
    return <CloudRain size={18} />;
  }

  if (
    normalized.includes("TRAFFIC") ||
    normalized.includes("CONGESTION")
  ) {
    return <Waves size={18} />;
  }

  if (
    normalized.includes("VEHICLE") ||
    normalized.includes("BREAKDOWN")
  ) {
    return <Truck size={18} />;
  }

  if (
    normalized.includes("ROAD") ||
    normalized.includes("CLOSURE")
  ) {
    return <Route size={18} />;
  }

  return <Zap size={18} />;
}

/* ============================================================
   PAGE
============================================================ */

export default function CommandCenter() {
  const [data, setData] =
    useState<OverviewData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const loadDashboard = useCallback(
    async (manual = false) => {
      try {
        if (manual) {
          setRefreshing(true);
        }

        setError("");

        const response = await fetch(
          `${API_BASE_URL}/api/v1/dashboard/overview`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(
            `Dashboard API returned ${response.status}`
          );
        }

        const result =
          (await response.json()) as OverviewData;

        setData(result);
      } catch (err) {
        console.error(
          "Command Center API error:",
          err
        );

        setError(
          "Unable to connect to the LogiShield API."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    loadDashboard();

    const interval =
      setInterval(() => {
        loadDashboard();
      }, 30000);

    return () =>
      clearInterval(interval);
  }, [loadDashboard]);

  /* ==========================================================
     SAFE DATA
  ========================================================== */

  const overview =
    data?.overview ?? {
      total_shipments: 0,
      delivered_shipments: 0,
      delayed_shipments: 0,
      in_transit_shipments: 0,
      cancelled_shipments: 0,
      delay_percentage: 0,
    };

  const risk =
    data?.risk ?? {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      average_delay_probability: 0,
      average_delay_probability_percentage: 0,
    };

  const disruptions =
    data?.disruptions ?? {
      total: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      top_types: [],
    };

  const routes =
    data?.routes ?? {
      total: 0,
      open: 0,
      unavailable: 0,
      average_risk: 0,
      average_distance_km: 0,
    };

  const vehicles =
    data?.vehicles ?? {
      total: 0,
      available: 0,
      active: 0,
      unavailable: 0,
      average_capacity_kg: 0,
    };

  const infrastructure =
    data?.infrastructure ?? {
      warehouses: 0,
      inventory_records: 0,
      total_inventory_units: 0,
    };

  const recovery =
    data?.recovery ?? {
      total_recovery_plans: 0,
    };

  const highRiskShipments =
    data?.high_risk_shipments ?? [];

  /* ==========================================================
     RISK DISTRIBUTION
  ========================================================== */

  const riskDistribution =
    useMemo(() => {
      const values = [
        {
          label: "Critical",
          value: risk.critical,
          className:
            "from-red-400 to-red-500",
          textClass: "text-red-300",
        },
        {
          label: "High",
          value: risk.high,
          className:
            "from-orange-300 to-orange-400",
          textClass: "text-orange-300",
        },
        {
          label: "Medium",
          value: risk.medium,
          className:
            "from-cyan-300 to-cyan-400",
          textClass: "text-cyan-300",
        },
        {
          label: "Low",
          value: risk.low,
          className:
            "from-slate-400 to-slate-500",
          textClass: "text-slate-400",
        },
      ];

      const max =
        Math.max(
          ...values.map(
            (item) => item.value
          ),
          1
        );

      return values.map((item) => ({
        ...item,
        height:
          item.value === 0
            ? 2
            : Math.max(
                8,
                (item.value / max) * 100
              ),
      }));
    }, [
      risk.critical,
      risk.high,
      risk.medium,
      risk.low,
    ]);

  /* ==========================================================
     HEALTH SCORE
  ========================================================== */

  const healthScore =
    Math.max(
      0,
      Math.min(
        100,
        100 -
          risk.average_delay_probability_percentage
      )
    );

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <div className="min-h-screen bg-[#05080d] text-white">

      {/* ======================================================
          SIDEBAR
      ====================================================== */}

      <Sidebar />

      {/* ======================================================
          MAIN
      ====================================================== */}

      <main className="min-h-screen pl-[274px]">

        {/* ====================================================
            TOP BAR
        ==================================================== */}

        <header className="sticky top-0 z-40 flex h-[82px] items-center justify-between border-b border-white/[0.06] bg-[#05080d]/95 px-8 backdrop-blur-xl">

          <div>
            <div className="text-[8px] font-bold tracking-[0.2em] text-slate-600">
              OPERATIONS CONTROL TOWER
            </div>

            <h1 className="mt-2 text-xl font-medium tracking-tight text-slate-100">
              Command Center
            </h1>
          </div>

          <div className="flex items-center gap-3">

            <div className="flex items-center gap-2 rounded-lg border border-cyan-300/10 bg-cyan-300/[0.035] px-4 py-2">

              <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(94,234,212,0.8)]" />

              <span className="text-[8px] font-bold tracking-[0.12em] text-cyan-300">
                {error
                  ? "API OFFLINE"
                  : "LIVE DATA"}
              </span>

            </div>

            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-2 text-[8px] text-slate-500">
              {new Date().toLocaleDateString(
                "en-IN",
                {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                }
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                loadDashboard(true)
              }
              disabled={refreshing}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.02] text-slate-400 transition hover:border-cyan-300/20 hover:text-cyan-300 disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />
            </button>

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-300 text-[9px] font-black text-[#061015]">
              LS
            </div>

          </div>

        </header>

        {/* ====================================================
            CONTENT
        ==================================================== */}

        <div className="p-8">

          {/* ==================================================
              HERO
          ================================================== */}

          <section className="relative overflow-hidden rounded-2xl border border-cyan-300/10 bg-gradient-to-br from-cyan-300/[0.045] via-[#0a1118] to-[#071018] p-7">

            <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-cyan-300/[0.025] blur-3xl" />

            <div className="relative flex items-center justify-between">

              <div>

                <div className="text-[8px] font-bold tracking-[0.2em] text-cyan-300/60">
                  NETWORK HEALTH
                </div>

                <h2 className="mt-3 text-[28px] font-medium tracking-tight text-slate-100">
                  Logistics network is operating
                  with live intelligence.
                </h2>

                <p className="mt-3 max-w-3xl text-[11px] leading-6 text-slate-500">
                  V2 ML intelligence evaluates
                  shipment delay probability using
                  the live PostgreSQL-backed
                  LogiShield API.
                </p>

              </div>

              {/* HEALTH */}

              <div className="mr-10 flex items-center gap-5">

                <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/[0.025]">

                  <div className="absolute inset-2 rounded-full border border-cyan-300/[0.04]" />

                  <span className="text-xl font-bold text-cyan-300">
                    {loading
                      ? "--"
                      : `${Math.round(
                          healthScore
                        )}%`}
                  </span>

                </div>

                <div>

                  <div className="text-[10px] font-bold tracking-[0.08em] text-slate-300">
                    HEALTH SCORE
                  </div>

                  <div className="mt-2 text-[8px] text-cyan-300/70">
                    Average predicted delay{" "}
                    {percentage(
                      risk.average_delay_probability_percentage
                    )}
                    %
                  </div>

                </div>

              </div>

            </div>

          </section>

          {/* ==================================================
              ERROR
          ================================================== */}

          {error && (
            <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.05] px-5 py-4 text-[10px] text-red-300">
              {error}
            </div>
          )}

          {/* ==================================================
              KPI CARDS
          ================================================== */}

          <section className="mt-5 grid grid-cols-5 gap-4">

            <MetricCard
              icon={
                <Package size={19} />
              }
              value={
                overview.total_shipments
              }
              label="Total shipments"
              description="Live shipment volume"
            />

            <MetricCard
              icon={
                <AlertTriangle
                  size={19}
                />
              }
              value={
                risk.critical +
                risk.high
              }
              label="At-risk shipments"
              description="Delay probability ≥ 50%"
            />

            <MetricCard
              icon={
                <ShieldAlert
                  size={19}
                />
              }
              value={risk.critical}
              label="Critical shipments"
              description="Delay probability ≥ 75%"
              danger
            />

            <MetricCard
              icon={
                <Zap size={19} />
              }
              value={disruptions.total}
              label="Active disruptions"
              description="Live disruption records"
            />

            <MetricCard
              icon={
                <Truck size={19} />
              }
              value={vehicles.total}
              label="Vehicles in network"
              description={`${vehicles.active} active · ${vehicles.available} available`}
            />

          </section>

          {/* ==================================================
              ANALYTICS
          ================================================== */}

          <section className="mt-5 grid grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)] gap-5">

            {/* =================================================
                RISK DISTRIBUTION
            ================================================= */}

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-6">

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-[8px] font-bold tracking-[0.2em] text-slate-600">
                    ML SIGNAL
                  </div>

                  <h3 className="mt-2 text-sm font-medium text-slate-200">
                    Risk Distribution
                  </h3>

                </div>

                <div className="flex items-center gap-2 text-[8px] text-cyan-300/70">

                  <span className="h-1.5 w-5 rounded-full bg-cyan-300" />

                  Live predictions

                </div>

              </div>

              {/* CHART */}

              <div className="relative mt-8 h-[290px]">

                {/* GRID */}

                <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">

                  {[100, 75, 50, 25, 0].map(
                    (item) => (
                      <div
                        key={item}
                        className="flex items-center gap-3"
                      >

                        <span className="w-8 text-right text-[7px] text-slate-700">
                          {item}%
                        </span>

                        <div className="h-px flex-1 border-t border-dashed border-white/[0.05]" />

                      </div>
                    )
                  )}

                </div>

                {/* BARS */}

                <div className="absolute inset-y-0 left-11 right-3 flex items-end justify-around gap-8 pb-8">

                  {riskDistribution.map(
                    (item) => (
                      <div
                        key={item.label}
                        className="flex h-full flex-1 flex-col items-center justify-end"
                      >

                        <div className="mb-3 text-[9px] font-bold text-slate-400">
                          {numberFormat(
                            item.value
                          )}
                        </div>

                        <div className="flex h-[210px] w-full max-w-[130px] items-end">

                          <div
                            className={`w-full rounded-t-lg bg-gradient-to-t ${item.className} shadow-[0_0_25px_rgba(94,234,212,0.08)] transition-all duration-700`}
                            style={{
                              height: `${item.height}%`,
                            }}
                          />

                        </div>

                        <div
                          className={`mt-4 text-[10px] font-medium ${item.textClass}`}
                        >
                          {item.label}
                        </div>

                      </div>
                    )
                  )}

                </div>

              </div>

            </div>

            {/* =================================================
                DISRUPTION WATCH
            ================================================= */}

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-6">

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-[8px] font-bold tracking-[0.2em] text-slate-600">
                    LIVE EVENTS
                  </div>

                  <h3 className="mt-2 text-sm font-medium text-slate-200">
                    Disruption Watch
                  </h3>

                </div>

                <Link
                  href="/disruptions"
                  className="flex items-center gap-1 text-[8px] text-slate-500 transition hover:text-cyan-300"
                >
                  View all
                  <ChevronRight
                    size={12}
                  />
                </Link>

              </div>

              <div className="mt-6">

                {disruptions.top_types
                  .length === 0 ? (

                  <div className="flex h-[280px] flex-col items-center justify-center">

                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] text-slate-700">
                      <ShieldAlert
                        size={22}
                      />
                    </div>

                    <div className="mt-4 text-[10px] text-slate-600">
                      No disruption data
                    </div>

                    <div className="mt-2 text-center text-[8px] text-slate-700">
                      The API currently returned
                      no disruption records.
                    </div>

                  </div>

                ) : (

                  <div className="space-y-0">

                    {disruptions.top_types
                      .slice(0, 5)
                      .map(
                        (
                          item,
                          index
                        ) => (
                          <DisruptionRow
                            key={`${item.disruption_type}-${index}`}
                            type={
                              item.disruption_type
                            }
                            occurrences={
                              item.occurrences
                            }
                          />
                        )
                      )}

                  </div>

                )}

              </div>

            </div>

          </section>

          {/* ==================================================
              SECOND ANALYTICS ROW
          ================================================== */}

          <section className="mt-5 grid grid-cols-3 gap-5">

            {/* =================================================
                SHIPMENT STATUS
            ================================================= */}

            <Panel title="Shipment Status">
              <StatusRow
                label="Delivered"
                value={
                  overview.delivered_shipments
                }
                total={
                  overview.total_shipments
                }
              />

              <StatusRow
                label="In transit"
                value={
                  overview.in_transit_shipments
                }
                total={
                  overview.total_shipments
                }
              />

              <StatusRow
                label="Delayed"
                value={
                  overview.delayed_shipments
                }
                total={
                  overview.total_shipments
                }
                danger
              />

              <StatusRow
                label="Cancelled"
                value={
                  overview.cancelled_shipments
                }
                total={
                  overview.total_shipments
                }
              />
            </Panel>

            {/* =================================================
                NETWORK
            ================================================= */}

            <Panel title="Network Intelligence">

              <InfoRow
                icon={<Route size={16} />}
                label="Routes"
                value={routes.total}
                suffix={`${routes.open} open`}
              />

              <InfoRow
                icon={<Map size={16} />}
                label="Average route risk"
                value={routes.average_risk}
                suffix="score"
              />

              <InfoRow
                icon={<Truck size={16} />}
                label="Available vehicles"
                value={
                  vehicles.available
                }
                suffix={`of ${numberFormat(
                  vehicles.total
                )}`}
              />

              <InfoRow
                icon={<Gauge size={16} />}
                label="Average capacity"
                value={numberFormat(
                  vehicles.average_capacity_kg
                )}
                suffix="kg"
              />

            </Panel>

            {/* =================================================
                INFRASTRUCTURE
            ================================================= */}

            <Panel title="Infrastructure">

              <InfoRow
                icon={<Boxes size={16} />}
                label="Warehouses"
                value={
                  infrastructure.warehouses
                }
                suffix="operational"
              />

              <InfoRow
                icon={<Package size={16} />}
                label="Inventory records"
                value={
                  infrastructure.inventory_records
                }
                suffix="records"
              />

              <InfoRow
                icon={<Boxes size={16} />}
                label="Inventory units"
                value={numberFormat(
                  infrastructure.total_inventory_units
                )}
                suffix="units"
              />

              <InfoRow
                icon={<ShieldAlert size={16} />}
                label="Recovery plans"
                value={
                  recovery.total_recovery_plans
                }
                suffix="available"
              />

            </Panel>

          </section>

          {/* ==================================================
              HIGH RISK SHIPMENTS
          ================================================== */}

          <section className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.015] p-6">

            <div className="flex items-center justify-between">

              <div>

                <div className="text-[8px] font-bold tracking-[0.2em] text-slate-600">
                  PRIORITY MONITORING
                </div>

                <h3 className="mt-2 text-sm font-medium text-slate-200">
                  Highest Risk Shipments
                </h3>

              </div>

              <Link
                href="/shipments"
                className="flex items-center gap-1 text-[8px] text-slate-500 transition hover:text-cyan-300"
              >
                Open shipment registry
                <ChevronRight
                  size={12}
                />
              </Link>

            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-white/[0.05]">

              <div className="grid grid-cols-[1.1fr_1.3fr_1.3fr_0.8fr_0.8fr_80px] border-b border-white/[0.05] bg-white/[0.02] px-4 py-3">

                <TableHeader>
                  Shipment
                </TableHeader>

                <TableHeader>
                  Origin
                </TableHeader>

                <TableHeader>
                  Destination
                </TableHeader>

                <TableHeader>
                  Status
                </TableHeader>

                <TableHeader>
                  Risk
                </TableHeader>

                <TableHeader>
                  Action
                </TableHeader>

              </div>

              {highRiskShipments.length ===
              0 ? (

                <div className="flex h-28 items-center justify-center text-[9px] text-slate-600">
                  No high-risk shipments returned by
                  the API.
                </div>

              ) : (

                highRiskShipments
                  .slice(0, 6)
                  .map((shipment) => (
                    <div
                      key={
                        shipment.shipment_id
                      }
                      className="grid grid-cols-[1.1fr_1.3fr_1.3fr_0.8fr_0.8fr_80px] items-center border-b border-white/[0.04] px-4 py-3 last:border-0 hover:bg-white/[0.015]"
                    >

                      <div>

                        <div className="text-[9px] font-semibold text-slate-300">
                          {
                            shipment.shipment_code
                          }
                        </div>

                        <div className="mt-1 text-[7px] text-slate-700">
                          ID #
                          {
                            shipment.shipment_id
                          }
                        </div>

                      </div>

                      <div className="text-[9px] text-slate-500">
                        {
                          shipment.source_city
                        }
                      </div>

                      <div className="text-[9px] text-slate-500">
                        {
                          shipment.destination_city
                        }
                      </div>

                      <div>

                        <span className="rounded-md border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-[7px] font-bold text-slate-500">
                          {
                            shipment.status
                          }
                        </span>

                      </div>

                      <div>

                        <span
                          className={`text-[9px] font-bold ${
                            shipment.risk_level ===
                            "CRITICAL"
                              ? "text-red-300"
                              : shipment.risk_level ===
                                "HIGH"
                              ? "text-orange-300"
                              : "text-cyan-300"
                          }`}
                        >
                          {percentage(
                            shipment.delay_probability_percentage
                          )}
                          %
                        </span>

                      </div>

                      <Link
                        href={`/shipments/${shipment.shipment_id}`}
                        className="text-[8px] text-cyan-300 transition hover:text-white"
                      >
                        Inspect
                      </Link>

                    </div>
                  ))

              )}

            </div>

          </section>

          {/* ==================================================
              FOOTER
          ================================================== */}

          <footer className="mt-7 flex items-center justify-between px-1 text-[7px] font-bold tracking-[0.12em] text-slate-700">

            <span>
              LOGISHIELD · NATIONAL LOGISTICS
              COMMAND CENTER
            </span>

            <span>
              MODEL: LOGISHIELD-DELAY-V2 ·{" "}
              {error
                ? "API DISCONNECTED"
                : "LIVE"}
            </span>

          </footer>

        </div>

      </main>

    </div>
  );
}

/* ============================================================
   METRIC CARD
============================================================ */

function MetricCard({
  icon,
  value,
  label,
  description,
  danger = false,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  description: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`group rounded-2xl border bg-gradient-to-br from-white/[0.025] to-white/[0.005] p-5 transition ${
        danger
          ? "border-red-400/20 hover:border-red-400/30"
          : "border-white/[0.07] hover:border-cyan-300/15"
      }`}
    >

      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          danger
            ? "bg-red-400/10 text-red-300"
            : "bg-cyan-300/[0.07] text-cyan-300"
        }`}
      >
        {icon}
      </div>

      <div className="mt-7 text-[27px] font-bold tracking-tight text-slate-100">
        {numberFormat(value)}
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
   DISRUPTION ROW
============================================================ */

function DisruptionRow({
  type,
  occurrences,
}: {
  type: string;
  occurrences: number;
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.05] py-4 last:border-0">

      <div className="flex items-center gap-3">

        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/10 bg-cyan-300/[0.035] text-cyan-300">
          {getDisruptionIcon(type)}
        </div>

        <div>

          <div className="text-[9px] font-semibold text-slate-300">
            {formatDisruptionType(type)}
          </div>

          <div className="mt-1 text-[7px] text-slate-600">
            {numberFormat(occurrences)}
            {" "}
            occurrences
          </div>

        </div>

      </div>

      <span className="rounded-md border border-cyan-300/10 bg-cyan-300/[0.03] px-2 py-1 text-[7px] font-bold text-cyan-300">
        ACTIVE
      </span>

    </div>
  );
}

/* ============================================================
   PANEL
============================================================ */

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-6">

      <div className="text-[8px] font-bold tracking-[0.2em] text-slate-600">
        NETWORK INTELLIGENCE
      </div>

      <h3 className="mt-2 text-sm font-medium text-slate-200">
        {title}
      </h3>

      <div className="mt-5">
        {children}
      </div>

    </div>
  );
}

/* ============================================================
   STATUS ROW
============================================================ */

function StatusRow({
  label,
  value,
  total,
  danger = false,
}: {
  label: string;
  value: number;
  total: number;
  danger?: boolean;
}) {
  const ratio =
    total > 0
      ? Math.min(
          100,
          (value / total) * 100
        )
      : 0;

  return (
    <div className="mb-5 last:mb-0">

      <div className="mb-2 flex items-center justify-between">

        <span className="text-[9px] text-slate-500">
          {label}
        </span>

        <span
          className={`text-[9px] font-bold ${
            danger
              ? "text-red-300"
              : "text-slate-300"
          }`}
        >
          {numberFormat(value)}
        </span>

      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">

        <div
          className={`h-full rounded-full transition-all duration-700 ${
            danger
              ? "bg-red-400"
              : "bg-cyan-300"
          }`}
          style={{
            width: `${ratio}%`,
          }}
        />

      </div>

    </div>
  );
}

/* ============================================================
   INFO ROW
============================================================ */

function InfoRow({
  icon,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  suffix: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.05] py-3.5 last:border-0">

      <div className="flex items-center gap-3">

        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-300/[0.05] text-cyan-300">
          {icon}
        </div>

        <span className="text-[9px] text-slate-500">
          {label}
        </span>

      </div>

      <div className="text-right">

        <div className="text-[10px] font-bold text-slate-300">
          {typeof value ===
          "number"
            ? numberFormat(value)
            : value}
        </div>

        <div className="mt-0.5 text-[7px] text-slate-700">
          {suffix}
        </div>

      </div>

    </div>
  );
}

/* ============================================================
   TABLE HEADER
============================================================ */

function TableHeader({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="text-[7px] font-bold tracking-[0.12em] text-slate-700">
      {children}
    </div>
  );
}