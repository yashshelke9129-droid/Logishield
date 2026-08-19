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
  X,
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

type PredictionData = {
  system: string;
  model: string;
  shipment: {
    shipment_id: number;
    shipment_code: string;
    source: string;
    destination: string;
    status: string;
  };
  prediction: {
    delay_probability: number;
    delay_probability_percentage: number;
    predicted_delayed: boolean;
    risk_level: string;
  };
  conditions: {
    weather: string;
    weather_severity: number;
    traffic: string;
    traffic_severity: number;
    active_disruptions: number;
    maximum_disruption_severity: number;
    route_risk: number;
    vehicle_utilization: number;
  };
  recommendations: string[];
  timestamp: string;
};

type RecoveryRoute = {
  route_id?: number | null;
  route_code?: string | null;
  source_location_id?: number | null;
  destination_location_id?: number | null;
  distance_km?: number | null;
  estimated_time_hours?: number | null;
  base_cost?: number | null;
  risk_score?: number | null;
  route_risk?: number | null;
  route_status?: string | null;
  status?: string | null;
  recovery_score?: number | null;
};

type RecoveryVehicle = {
  vehicle_id?: number | null;
  vehicle_type?: string | null;
  capacity_kg?: number | null;
  fuel_efficiency_km_per_litre?: number | null;
  status?: string | null;
  utilization_percentage?: number | null;
  vehicle_score?: number | null;
};

type RecoveryPath = {
  base_cost?: number | null;
  path_id?: string | number | null;
  route_id?: number | null;
  route_code?: string | null;
  source_location_id?: number | null;
  destination_location_id?: number | null;
  distance_km?: number | null;
  estimated_time_hours?: number | null;
  total_distance_km?: number | null;
  total_time_hours?: number | null;
  total_cost?: number | null;
  cost?: number | null;
  risk_score?: number | null;
  recovery_score?: number | null;
  status?: string | null;
  route_status?: string | null;
  route_ids?: number[];
  route_codes?: string[];
  segments?: RecoveryRoute[];
  route_segments?: RecoveryRoute[];
};

type RecoveryData = {
  system?: string;
  engine?: string;
  version?: string;
  optimization?: string;
  optimization_method?: string;
  route_strategy?: string;
  destination_reached?: boolean;

  shipment?: {
    shipment_id?: number;
    shipment_code?: string;
    source_location_id?: number;
    destination_location_id?: number;
    weight_kg?: number | null;
    current_vehicle_id?: number | null;
    current_route_id?: number | null;
  };

  risk?: {
    delay_probability?: number | null;
    delay_probability_percentage?: number | null;
    intervention?: string | null;
    weather?: string | null;
    traffic?: string | null;
    active_disruptions?: number | null;
    maximum_disruption_severity?: number | null;
    operational_risk?: number | null;
  };

  current_route?: RecoveryRoute | null;

  // Current Recovery Engine response.
  recovery_paths?: RecoveryPath[];
  route_segments?: RecoveryRoute[];

  // Kept for backward compatibility with the older response.
  alternative_routes?: RecoveryRoute[];

  alternative_vehicles?: RecoveryVehicle[];

  recommended_recovery?: {
    strategy?: string | null;
    route_id?: number | null;
    route_code?: string | null;
    vehicle_id?: number | null;
    recovery_score?: number | null;
    route_risk?: number | null;
    estimated_time_hours?: number | null;
    distance_km?: number | null;
    base_cost?: number | null;
    reason?: string | null;
  } | null;

  explanation?: string[];
  option_count?: number | null;

  [key: string]: unknown;
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

  const [selectedShipment, setSelectedShipment] =
    useState<HighRiskShipment | null>(null);
  const [prediction, setPrediction] =
    useState<PredictionData | null>(null);
  const [recoveryAnalysis, setRecoveryAnalysis] =
    useState<RecoveryData | null>(null);
  const [analysisLoading, setAnalysisLoading] =
    useState(false);
  const [analysisError, setAnalysisError] =
    useState("");

  const analyzeShipment = useCallback(
    async (shipment: HighRiskShipment) => {
      setSelectedShipment(shipment);
      setPrediction(null);
      setRecoveryAnalysis(null);
      setAnalysisError("");
      setAnalysisLoading(true);

      try {
        const [predictionResponse, recoveryResponse] =
          await Promise.all([
            fetch(
              `${API_BASE_URL}/api/v1/predictions/shipment/${shipment.shipment_id}`,
              { cache: "no-store" }
            ),
            fetch(
              `${API_BASE_URL}/api/v1/recovery/shipment/${shipment.shipment_id}`,
              { cache: "no-store" }
            ),
          ]);

        const predictionJson = await predictionResponse.json();
        if (!predictionResponse.ok) {
          throw new Error(
            predictionJson?.detail ||
              `Prediction API returned ${predictionResponse.status}`
          );
        }

        setPrediction(predictionJson as PredictionData);

        const recoveryJson = await recoveryResponse.json();
        if (!recoveryResponse.ok) {
          throw new Error(
            recoveryJson?.detail ||
              `Recovery API returned ${recoveryResponse.status}`
          );
        }

        setRecoveryAnalysis(recoveryJson as RecoveryData);
      } catch (err) {
        console.error("Shipment analysis error:", err);
        setAnalysisError(
          err instanceof Error
            ? err.message
            : "Unable to load shipment intelligence."
        );
      } finally {
        setAnalysisLoading(false);
      }
    },
    []
  );

  const closeAnalysis = () => {
    setSelectedShipment(null);
    setPrediction(null);
    setRecoveryAnalysis(null);
    setAnalysisError("");
  };

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
              description="Delay probability â‰¥ 50%"
            />

            <MetricCard
              icon={
                <ShieldAlert
                  size={19}
                />
              }
              value={risk.critical}
              label="Critical shipments"
              description="Delay probability â‰¥ 75%"
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
              description={`${vehicles.active} active Â· ${vehicles.available} available`}
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

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => analyzeShipment(shipment)}
                          className="text-[8px] font-semibold text-cyan-300 transition hover:text-white"
                        >
                          Analyze
                        </button>
                        <Link
                          href={`/shipments/${shipment.shipment_id}`}
                          className="text-[8px] text-slate-500 transition hover:text-cyan-300"
                        >
                          Open
                        </Link>
                      </div>

                    </div>
                  ))

              )}

            </div>

          </section>

          {selectedShipment && (
            <ShipmentAnalysisModal
              shipment={selectedShipment}
              prediction={prediction}
              recovery={recoveryAnalysis}
              loading={analysisLoading}
              error={analysisError}
              onClose={closeAnalysis}
            />
          )}

          {/* ==================================================
              FOOTER
          ================================================== */}

          <footer className="mt-7 flex items-center justify-between px-1 text-[7px] font-bold tracking-[0.12em] text-slate-700">

            <span>
              LOGISHIELD Â· NATIONAL LOGISTICS
              COMMAND CENTER
            </span>

            <span>
              MODEL: LOGISHIELD-DELAY-V2 Â·{" "}
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
   SHIPMENT ANALYSIS MODAL
============================================================ */

function ShipmentAnalysisModal({
  shipment,
  prediction,
  recovery,
  loading,
  error,
  onClose,
}: {
  shipment: HighRiskShipment;
  prediction: PredictionData | null;
  recovery: RecoveryData | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  const recommendation = recovery?.recommended_recovery;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-cyan-300/10 bg-[#081018] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.07] bg-[#081018]/95 px-6 py-5 backdrop-blur-xl">
          <div>
            <div className="text-[8px] font-bold tracking-[0.2em] text-cyan-300/60">
              LIVE SHIPMENT INTELLIGENCE
            </div>
            <h2 className="mt-2 text-lg font-semibold text-slate-100">
              {shipment.shipment_code}
            </h2>
            <div className="mt-1 text-[8px] text-slate-600">
              {shipment.source_city} â†’ {shipment.destination_city}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.07] text-slate-500 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6">
          {loading && (
            <div className="flex min-h-[300px] items-center justify-center">
              <div className="flex items-center gap-3 text-[10px] text-cyan-300">
                <RefreshCw size={15} className="animate-spin" />
                Running V2 prediction and recovery engine...
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-5 text-[10px] text-red-300">
              {error}
            </div>
          )}

          {!loading && !error && prediction && (
            <>
              <div className="grid grid-cols-4 gap-4">
                <MetricCard
                  icon={<ShieldAlert size={18} />}
                  value={prediction.prediction.delay_probability_percentage}
                  label="Delay probability %"
                  description={prediction.prediction.risk_level}
                  danger={prediction.prediction.risk_level === "CRITICAL"}
                />
                <MetricCard
                  icon={<CloudRain size={18} />}
                  value={prediction.conditions.weather_severity}
                  label="Weather severity"
                  description={prediction.conditions.weather}
                />
                <MetricCard
                  icon={<Waves size={18} />}
                  value={prediction.conditions.traffic_severity}
                  label="Traffic severity"
                  description={prediction.conditions.traffic}
                />
                <MetricCard
                  icon={<Zap size={18} />}
                  value={prediction.conditions.active_disruptions}
                  label="Active disruptions"
                  description="Current shipment exposure"
                />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-5">
                <Panel title="ML Prediction">
                  <InfoRow
                    icon={<Gauge size={16} />}
                    label="Probability"
                    value={`${prediction.prediction.delay_probability_percentage.toFixed(2)}%`}
                    suffix={prediction.prediction.predicted_delayed ? "Predicted delayed" : "Predicted on-time"}
                  />
                  <InfoRow
                    icon={<ShieldAlert size={16} />}
                    label="Risk level"
                    value={prediction.prediction.risk_level}
                    suffix="V2 classifier"
                  />
                  <InfoRow
                    icon={<Route size={16} />}
                    label="Route risk"
                    value={prediction.conditions.route_risk}
                    suffix="route score"
                  />
                  <InfoRow
                    icon={<Truck size={16} />}
                    label="Vehicle utilization"
                    value={`${(prediction.conditions.vehicle_utilization * 100).toFixed(2)}%`}
                    suffix="current shipment"
                  />

                  <div className="mt-5 space-y-2">
                    {prediction.recommendations.map((item, index) => (
                      <div
                        key={`${item}-${index}`}
                        className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[9px] leading-5 text-slate-500"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Recovery Decision Engine">
                  {recovery ? (
                    <>
                      <div className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.035] p-4">
                        <div className="text-[8px] font-bold tracking-[0.15em] text-cyan-300/60">
                          RECOMMENDED STRATEGY
                        </div>
                        <div className="mt-2 text-lg font-bold text-cyan-300">
                          {recommendation?.strategy ?? "NO_ACTION"}
                        </div>
                        <div className="mt-2 text-[9px] leading-5 text-slate-500">
                          {recommendation?.reason ??
                            "No recovery recommendation returned."}
                        </div>
                      </div>

                      <InfoRow
                        icon={<ShieldAlert size={16} />}
                        label="Intervention"
                        value={recovery.risk?.intervention ?? "N/A"}
                        suffix="recovery engine"
                      />
                      <InfoRow
                        icon={<Route size={16} />}
                        label="Operational risk"
                        value={recovery.risk?.operational_risk ?? "N/A"}
                        suffix="score"
                      />
                      <InfoRow
                        icon={<Map size={16} />}
                        label="Recovery options"
                        value={recovery.option_count ?? 0}
                        suffix="available options"
                      />

                      {recommendation && (
                        <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                          <div className="grid grid-cols-2 gap-4">
                            <SmallValue label="Route" value={recommendation.route_code ?? "N/A"} />
                            <SmallValue label="Vehicle" value={recommendation.vehicle_id != null ? `#${recommendation.vehicle_id}` : "N/A"} />
                            <SmallValue label="Distance" value={formatNumber(recommendation.distance_km, " km")} />
                            <SmallValue label="ETA" value={formatNumber(recommendation.estimated_time_hours, " h")} />
                            <SmallValue label="Route risk" value={formatNumber(recommendation.route_risk)} />
                            <SmallValue label="Recovery score" value={formatNumber(recommendation.recovery_score)} />
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-[9px] text-slate-600">No recovery result returned.</div>
                  )}
                </Panel>
              </div>

              {recovery && (
                <RecoveryOptions
                  recovery={recovery}
                />
              )}

              {Array.isArray(recovery?.explanation) && recovery.explanation.length > 0 ? (
                <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
                  <div className="text-[8px] font-bold tracking-[0.15em] text-slate-600">ENGINE EXPLANATION</div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {recovery.explanation.map((item, index) => (
                      <div
                        key={`${String(item)}-${index}`}
                        className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-[9px] text-slate-500"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatNumber(
  value: number | null | undefined,
  suffix = ""
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  return `${value.toFixed(2)}${suffix}`;
}

function getRecoveryRoutes(
  recovery: RecoveryData
): RecoveryRoute[] {
  const legacyRoutes = Array.isArray(recovery.alternative_routes)
    ? recovery.alternative_routes
    : [];

  if (legacyRoutes.length > 0) {
    return legacyRoutes;
  }

  const paths = Array.isArray(recovery.recovery_paths)
    ? recovery.recovery_paths
    : [];

  const flattened: RecoveryRoute[] = [];

  for (const path of paths) {
    const nestedSegments = [
      ...(Array.isArray(path.segments) ? path.segments : []),
      ...(Array.isArray(path.route_segments) ? path.route_segments : []),
    ];

    if (nestedSegments.length > 0) {
      flattened.push(...nestedSegments);
      continue;
    }

    flattened.push({
      route_id: path.route_id,
      route_code:
        path.route_code ??
        (Array.isArray(path.route_codes)
          ? path.route_codes.join(" â†’ ")
          : null),
      source_location_id: path.source_location_id,
      destination_location_id: path.destination_location_id,
      distance_km:
        path.distance_km ??
        path.total_distance_km ??
        null,
      estimated_time_hours:
        path.estimated_time_hours ??
        path.total_time_hours ??
        null,
      base_cost:
        path.base_cost ??
        path.total_cost ??
        path.cost ??
        null,
      risk_score: path.risk_score,
      recovery_score: path.recovery_score,
      route_status: path.route_status ?? path.status,
      status: path.status,
    });
  }

  if (flattened.length > 0) {
    return flattened;
  }

  return Array.isArray(recovery.route_segments)
    ? recovery.route_segments
    : [];
}

function RecoveryOptions({
  recovery,
}: {
  recovery: RecoveryData;
}) {
  const routes = getRecoveryRoutes(recovery);
  const vehicles = Array.isArray(recovery.alternative_vehicles)
    ? recovery.alternative_vehicles
    : [];

  return (
    <div className="mt-5 grid grid-cols-2 gap-5">
      <Panel
        title={
          recovery.recovery_paths?.length
            ? "Recovery Paths"
            : "Alternative Routes"
        }
      >
        {routes.length > 0 ? (
          routes.slice(0, 5).map((route, index) => (
            <div
              key={`${route.route_id ?? route.route_code ?? "route"}-${index}`}
              className="flex items-center justify-between border-b border-white/[0.05] py-3 last:border-0"
            >
              <div>
                <div className="text-[9px] font-semibold text-slate-300">
                  {route.route_code ?? `Route ${index + 1}`}
                </div>
                <div className="mt-1 text-[7px] text-slate-600">
                  {formatNumber(route.distance_km, " km")} Â·{" "}
                  {formatNumber(route.estimated_time_hours, " h")}
                </div>
              </div>

              <div className="text-right">
                <div className="text-[9px] font-bold text-cyan-300">
                  {formatNumber(
                    route.recovery_score ?? route.risk_score
                  )}
                </div>
                <div className="text-[7px] text-slate-600">
                  {route.recovery_score != null
                    ? "recovery score"
                    : "route score"}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-4 py-4 text-[9px] text-slate-600">
            No alternative recovery routes returned.
          </div>
        )}
      </Panel>

      <Panel title="Alternative Vehicles">
        {vehicles.length > 0 ? (
          vehicles.slice(0, 5).map((vehicle, index) => (
            <div
              key={`${vehicle.vehicle_id ?? "vehicle"}-${index}`}
              className="flex items-center justify-between border-b border-white/[0.05] py-3 last:border-0"
            >
              <div>
                <div className="text-[9px] font-semibold text-slate-300">
                  {vehicle.vehicle_id != null
                    ? `Vehicle #${vehicle.vehicle_id}`
                    : "Vehicle"}
                </div>
                <div className="mt-1 text-[7px] text-slate-600">
                  {vehicle.vehicle_type ?? "Unknown type"} Â·{" "}
                  {typeof vehicle.capacity_kg === "number"
                    ? `${numberFormat(vehicle.capacity_kg)} kg`
                    : "Capacity N/A"}
                </div>
              </div>

              <div className="text-right">
                <div className="text-[9px] font-bold text-cyan-300">
                  {formatNumber(vehicle.vehicle_score)}
                </div>
                <div className="text-[7px] text-slate-600">
                  vehicle score
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-4 py-4 text-[9px] text-slate-600">
            No alternative vehicles returned.
          </div>
        )}
      </Panel>
    </div>
  );
}

function SmallValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-[7px] font-bold tracking-[0.1em] text-slate-700">{label}</div>
      <div className="mt-1 text-[10px] font-semibold text-slate-300">{value}</div>
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
