"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CloudRain,
  Filter,
  Package,
  RefreshCw,
  Route,
  Search,
  ShieldAlert,
  Truck,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  apiFetch,
} from "@/lib/api";

type Shipment = {
  shipment_id: number;
  shipment_code: string;
  status: string;
  source_location_id: number;
  destination_location_id: number;
  departure_time: string | null;
  weather: string;
  traffic: string;
  active_disruptions: number;
  route_risk: number;
};

type Prediction = {
  shipment?: {
    shipment_id: number;
    shipment_code: string;
    source: string;
    destination: string;
    status: string;
  };

  prediction?: {
    delay_probability: number;
    delay_probability_percentage: number;
    predicted_delayed: boolean;
    risk_level: string;
  };

  conditions?: {
    weather: string;
    weather_severity: number;
    traffic: string;
    traffic_severity: number;
    active_disruptions: number;
    maximum_disruption_severity: number;
    route_risk: number;
    vehicle_utilization: number;
  };

  recommendations?: string[];

  timestamp?: string;
};

type StatusFilter =
  | "ALL"
  | "DELIVERED"
  | "DELAYED"
  | "IN_TRANSIT"
  | "CANCELLED";

type RiskFilter =
  | "ALL"
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "LOW";

function formatNumber(value: number) {
  return value.toLocaleString("en-IN");
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function riskFromRoute(value: number) {
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

function riskClass(risk: string) {
  switch (risk.toUpperCase()) {
    case "CRITICAL":
      return "border-red-400/25 bg-red-400/10 text-red-300";

    case "HIGH":
      return "border-orange-400/25 bg-orange-400/10 text-orange-300";

    case "MEDIUM":
      return "border-yellow-300/25 bg-yellow-300/10 text-yellow-300";

    default:
      return "border-cyan-300/20 bg-cyan-300/10 text-cyan-300";
  }
}

function statusClass(status: string) {
  switch (status.toUpperCase()) {
    case "DELIVERED":
      return "border-cyan-300/20 bg-cyan-300/10 text-cyan-300";

    case "DELAYED":
      return "border-red-400/20 bg-red-400/10 text-red-300";

    case "IN_TRANSIT":
      return "border-blue-400/20 bg-blue-400/10 text-blue-300";

    case "CANCELLED":
      return "border-slate-400/20 bg-slate-400/10 text-slate-400";

    default:
      return "border-white/10 bg-white/[0.03] text-slate-400";
  }
}

export default function ShipmentsPage() {
  const [shipments, setShipments] =
    useState<Shipment[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("ALL");

  const [riskFilter, setRiskFilter] =
    useState<RiskFilter>("ALL");

  const [selectedShipment, setSelectedShipment] =
    useState<Shipment | null>(null);

  const [prediction, setPrediction] =
    useState<Prediction | null>(null);

  const [predictionLoading, setPredictionLoading] =
    useState(false);

  const [showFilters, setShowFilters] =
    useState(false);

  async function loadShipments() {
    try {
      setError("");

      const result = await apiFetch<{
        count: number;
        shipments: Shipment[];
      }>("/api/v1/shipments?limit=100");

      setShipments(
        Array.isArray(result.shipments)
          ? result.shipments
          : []
      );
    } catch (err) {
      console.error(
        "Shipment API error:",
        err
      );

      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load shipment data from LogiShield API."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function refreshShipments() {
    setRefreshing(true);
    await loadShipments();
  }

  async function openShipment(
    shipment: Shipment
  ) {
    setSelectedShipment(shipment);
    setPrediction(null);
    setPredictionLoading(true);

    try {
      const result = await apiFetch<Prediction>(
        `/api/v1/predictions/shipment/${shipment.shipment_id}`
      );

      setPrediction(result);
    } catch (err) {
      console.error(
        "Prediction API error:",
        err
      );

      setPrediction(null);
    } finally {
      setPredictionLoading(false);
    }
  }

  useEffect(() => {
    loadShipments();
  }, []);

  const filteredShipments =
    useMemo(() => {
      const query =
        search.trim().toLowerCase();

      return shipments.filter(
        (shipment) => {
          const matchesSearch =
            !query ||
            shipment.shipment_code
              .toLowerCase()
              .includes(query) ||
            String(
              shipment.shipment_id
            ).includes(query) ||
            shipment.weather
              .toLowerCase()
              .includes(query) ||
            shipment.traffic
              .toLowerCase()
              .includes(query);

          const matchesStatus =
            statusFilter === "ALL" ||
            shipment.status.toUpperCase() ===
              statusFilter;

          const shipmentRisk =
            riskFromRoute(
              Number(
                shipment.route_risk || 0
              )
            );

          const matchesRisk =
            riskFilter === "ALL" ||
            shipmentRisk === riskFilter;

          return (
            matchesSearch &&
            matchesStatus &&
            matchesRisk
          );
        }
      );
    }, [
      shipments,
      search,
      statusFilter,
      riskFilter,
    ]);

  const statistics = useMemo(() => {
    const total = shipments.length;

    const delivered =
      shipments.filter(
        (x) =>
          x.status.toUpperCase() ===
          "DELIVERED"
      ).length;

    const delayed =
      shipments.filter(
        (x) =>
          x.status.toUpperCase() ===
          "DELAYED"
      ).length;

    const inTransit =
      shipments.filter(
        (x) =>
          x.status.toUpperCase() ===
          "IN_TRANSIT"
      ).length;

    const disrupted =
      shipments.filter(
        (x) =>
          Number(
            x.active_disruptions || 0
          ) > 0
      ).length;

    return {
      total,
      delivered,
      delayed,
      inTransit,
      disrupted,
    };
  }, [shipments]);

  return (
    <main className="min-h-screen bg-[#05080d] text-white">
      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="sticky top-0 z-30 flex h-[82px] items-center justify-between border-b border-white/[0.06] bg-[#05080d]/95 px-5 backdrop-blur-xl lg:px-8">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-slate-400 transition hover:border-cyan-300/20 hover:text-cyan-300"
          >
            <ArrowLeft size={18} />
          </Link>

          <div>
            <div className="text-[8px] font-bold tracking-[0.2em] text-cyan-300/50">
              LOGISHIELD OPERATIONS
            </div>

            <h1 className="mt-1 text-xl font-medium tracking-tight text-slate-100">
              Shipment Intelligence
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-lg border border-cyan-400/10 bg-cyan-400/[0.035] px-3 py-2 sm:flex">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(94,234,212,0.7)]" />

            <span className="text-[8px] font-bold tracking-[0.1em] text-cyan-300">
              LIVE DATA
            </span>
          </div>

          <button
            onClick={refreshShipments}
            disabled={refreshing}
            className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 text-[9px] font-bold text-slate-400 transition hover:border-cyan-300/20 hover:text-cyan-300 disabled:opacity-50"
          >
            <RefreshCw
              size={13}
              className={
                refreshing
                  ? "animate-spin"
                  : ""
              }
            />

            <span className="hidden sm:block">
              Refresh
            </span>
          </button>

          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-300 text-[9px] font-black text-[#071014]">
            LS
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1700px] p-5 lg:p-8">
        {/* =====================================================
            HERO
        ===================================================== */}

        <section className="relative overflow-hidden rounded-2xl border border-cyan-300/10 bg-gradient-to-br from-cyan-300/[0.07] via-[#0b141d] to-[#071018] p-6 lg:p-7">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-300/[0.04] blur-3xl" />

          <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-center">
            <div>
              <div className="text-[8px] font-bold tracking-[0.2em] text-cyan-300/60">
                SHIPMENT CONTROL
              </div>

              <h2 className="mt-3 text-2xl font-medium tracking-tight text-slate-100 lg:text-3xl">
                Monitor every shipment
                across the logistics
                network.
              </h2>

              <p className="mt-3 max-w-2xl text-xs leading-6 text-slate-500">
                Search operational shipments,
                inspect route exposure,
                monitor disruption conditions
                and run V2 ML delay predictions
                on individual shipments.
              </p>
            </div>

            {loading ||
            (error &&
              shipments.length === 0) ? null : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              <MiniStat
                icon={<Package size={16} />}
                value={formatNumber(
                  statistics.total
                )}
                label="Loaded"
              />

              <MiniStat
                icon={<Activity size={16} />}
                value={formatNumber(
                  statistics.inTransit
                )}
                label="In transit"
              />

              <MiniStat
                icon={<AlertTriangle size={16} />}
                value={formatNumber(
                  statistics.delayed
                )}
                label="Delayed"
                danger
              />

              <MiniStat
                icon={<Zap size={16} />}
                value={formatNumber(
                  statistics.disrupted
                )}
                label="Disrupted"
              />
              </div>
            )}
          </div>
        </section>

        {/* =====================================================
            TOOLBAR
        ===================================================== */}

        <section className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {/* SEARCH */}

            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600"
              />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search shipment code, ID, weather or traffic..."
                className="h-11 w-full rounded-xl border border-white/[0.07] bg-[#05080d] pl-11 pr-10 text-xs text-slate-200 outline-none placeholder:text-slate-700 focus:border-cyan-300/30"
              />

              {search && (
                <button
                  onClick={() =>
                    setSearch("")
                  }
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* FILTER BUTTON */}

            <button
              onClick={() =>
                setShowFilters(
                  !showFilters
                )
              }
              className={`flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-semibold transition ${
                showFilters ||
                statusFilter !==
                  "ALL" ||
                riskFilter !== "ALL"
                  ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-300"
                  : "border-white/[0.07] bg-[#05080d] text-slate-400 hover:text-slate-200"
              }`}
            >
              <Filter size={14} />
              Filters
              <ChevronDown
                size={14}
                className={
                  showFilters
                    ? "rotate-180 transition"
                    : "transition"
                }
              />
            </button>
          </div>

          {showFilters && (
            <div className="mt-4 grid gap-4 border-t border-white/[0.06] pt-4 md:grid-cols-2">
              {/* STATUS */}

              <FilterSelect
                label="Shipment status"
                value={statusFilter}
                options={[
                  "ALL",
                  "DELIVERED",
                  "DELAYED",
                  "IN_TRANSIT",
                  "CANCELLED",
                ]}
                onChange={(value) =>
                  setStatusFilter(
                    value as StatusFilter
                  )
                }
              />

              {/* RISK */}

              <FilterSelect
                label="Route risk"
                value={riskFilter}
                options={[
                  "ALL",
                  "CRITICAL",
                  "HIGH",
                  "MEDIUM",
                  "LOW",
                ]}
                onChange={(value) =>
                  setRiskFilter(
                    value as RiskFilter
                  )
                }
              />
            </div>
          )}
        </section>

        {/* =====================================================
            ERROR
        ===================================================== */}

        {error && (
          <section className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.05] p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle
                size={18}
                className="text-red-400"
              />

              <div>
                <div className="text-xs font-semibold text-red-300">
                  API connection problem
                </div>

                <div className="mt-1 text-[9px] text-red-300/60">
                  {error}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* =====================================================
            TABLE
        ===================================================== */}

        <section className="mt-5 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
          <div className="flex flex-col justify-between gap-3 border-b border-white/[0.06] p-5 sm:flex-row sm:items-center">
            <div>
              <div className="text-[8px] font-bold tracking-[0.18em] text-slate-600">
                LIVE SHIPMENT STREAM
              </div>

              <h3 className="mt-2 text-sm font-medium text-slate-200">
                Shipment Registry
              </h3>
            </div>

            <div className="text-[9px] text-slate-600">
              Showing{" "}
              <span className="font-bold text-cyan-300">
                {formatNumber(
                  filteredShipments.length
                )}
              </span>{" "}
              shipments
            </div>
          </div>

          {loading ? (
            <LoadingState />
          ) : error &&
            shipments.length === 0 ? (
            <ErrorState
              message={error}
              onRetry={loadShipments}
            />
          ) : filteredShipments.length ===
            0 ? (
            <EmptyState
              onClear={() => {
                setSearch("");
                setStatusFilter("ALL");
                setRiskFilter("ALL");
              }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.015] text-left">
                    <th className="px-5 py-4 text-[8px] font-bold tracking-[0.12em] text-slate-600">
                      SHIPMENT
                    </th>

                    <th className="px-5 py-4 text-[8px] font-bold tracking-[0.12em] text-slate-600">
                      STATUS
                    </th>

                    <th className="px-5 py-4 text-[8px] font-bold tracking-[0.12em] text-slate-600">
                      DEPARTURE
                    </th>

                    <th className="px-5 py-4 text-[8px] font-bold tracking-[0.12em] text-slate-600">
                      WEATHER
                    </th>

                    <th className="px-5 py-4 text-[8px] font-bold tracking-[0.12em] text-slate-600">
                      TRAFFIC
                    </th>

                    <th className="px-5 py-4 text-[8px] font-bold tracking-[0.12em] text-slate-600">
                      DISRUPTIONS
                    </th>

                    <th className="px-5 py-4 text-[8px] font-bold tracking-[0.12em] text-slate-600">
                      ROUTE RISK
                    </th>

                    <th className="px-5 py-4 text-right text-[8px] font-bold tracking-[0.12em] text-slate-600">
                      ACTION
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredShipments.map(
                    (shipment) => {
                      const routeRisk =
                        Number(
                          shipment.route_risk ||
                            0
                        );

                      const risk =
                        riskFromRoute(
                          routeRisk
                        );

                      return (
                        <tr
                          key={
                            shipment.shipment_id
                          }
                          className="group border-b border-white/[0.045] transition hover:bg-cyan-300/[0.025]"
                        >
                          {/* SHIPMENT */}

                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/10 bg-cyan-300/[0.04] text-cyan-300">
                                <Package
                                  size={16}
                                />
                              </div>

                              <div>
                                <div className="text-[10px] font-bold text-slate-200">
                                  {
                                    shipment.shipment_code
                                  }
                                </div>

                                <div className="mt-1 text-[7px] text-slate-600">
                                  ID #
                                  {
                                    shipment.shipment_id
                                  }
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* STATUS */}

                          <td className="px-5 py-4">
                            <span
                              className={`rounded-md border px-2 py-1 text-[7px] font-bold ${statusClass(
                                shipment.status
                              )}`}
                            >
                              {shipment.status.replaceAll(
                                "_",
                                " "
                              )}
                            </span>
                          </td>

                          {/* DEPARTURE */}

                          <td className="px-5 py-4">
                            <div className="text-[9px] text-slate-400">
                              {formatDate(
                                shipment.departure_time
                              )}
                            </div>
                          </td>

                          {/* WEATHER */}

                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <CloudRain
                                size={14}
                                className="text-cyan-300/60"
                              />

                              <span className="text-[9px] text-slate-400">
                                {shipment.weather
                                  ?.replaceAll(
                                    "_",
                                    " "
                                  ) ||
                                  "NORMAL"}
                              </span>
                            </div>
                          </td>

                          {/* TRAFFIC */}

                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <Route
                                size={14}
                                className="text-slate-600"
                              />

                              <span className="text-[9px] text-slate-400">
                                {shipment.traffic ||
                                  "NORMAL"}
                              </span>
                            </div>
                          </td>

                          {/* DISRUPTIONS */}

                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <Zap
                                size={14}
                                className={
                                  shipment.active_disruptions >
                                  0
                                    ? "text-orange-300"
                                    : "text-slate-700"
                                }
                              />

                              <span
                                className={
                                  shipment.active_disruptions >
                                  0
                                    ? "text-[9px] font-semibold text-orange-300"
                                    : "text-[9px] text-slate-500"
                                }
                              >
                                {
                                  shipment.active_disruptions
                                }
                              </span>
                            </div>
                          </td>

                          {/* ROUTE RISK */}

                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className={`h-full rounded-full ${
                                    risk ===
                                    "CRITICAL"
                                      ? "bg-red-400"
                                      : risk ===
                                        "HIGH"
                                      ? "bg-orange-300"
                                      : risk ===
                                        "MEDIUM"
                                      ? "bg-yellow-300"
                                      : "bg-cyan-300"
                                  }`}
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      Math.max(
                                        0,
                                        routeRisk
                                      )
                                    )}%`,
                                  }}
                                />
                              </div>

                              <span
                                className={`rounded-md border px-2 py-1 text-[7px] font-bold ${riskClass(
                                  risk
                                )}`}
                              >
                                {Math.round(
                                  routeRisk
                                )}
                              </span>
                            </div>
                          </td>

                          {/* ACTION */}

                          <td className="px-5 py-4 text-right">
                            <button
                              onClick={() =>
                                openShipment(
                                  shipment
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/10 bg-cyan-300/[0.035] px-3 py-2 text-[8px] font-bold text-cyan-300 transition hover:border-cyan-300/30 hover:bg-cyan-300/10"
                            >
                              Inspect
                              <ChevronRight
                                size={13}
                              />
                            </button>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* =====================================================
            FOOTER
        ===================================================== */}

        <footer className="mt-6 flex flex-col justify-between gap-3 px-1 pb-6 text-[7px] font-bold tracking-[0.1em] text-slate-700 sm:flex-row">
          <span>
            LOGISHIELD · SHIPMENT INTELLIGENCE
          </span>

          <span>
            API:{" "}
            {error
              ? "OFFLINE"
              : "CONNECTED"}{" "}
            · MODEL: LOGISHIELD-DELAY-V2
          </span>
        </footer>
      </div>

      {/* =====================================================
          SHIPMENT INSPECTION DRAWER
      ===================================================== */}

      {selectedShipment && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() =>
              setSelectedShipment(null)
            }
          />

          <aside className="absolute right-0 top-0 h-full w-full max-w-[520px] overflow-y-auto border-l border-white/[0.08] bg-[#080d13] shadow-[-20px_0_80px_rgba(0,0,0,0.5)]">
            {/* DRAWER HEADER */}

            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-[#080d13]/95 p-5 backdrop-blur-xl">
              <div>
                <div className="text-[8px] font-bold tracking-[0.18em] text-cyan-300/50">
                  SHIPMENT INSPECTION
                </div>

                <div className="mt-2 text-lg font-semibold text-slate-100">
                  {
                    selectedShipment.shipment_code
                  }
                </div>
              </div>

              <button
                onClick={() =>
                  setSelectedShipment(null)
                }
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-slate-500 hover:text-slate-200"
              >
                <X size={17} />
              </button>
            </div>

            <div className="p-5">
              {/* BASIC INFO */}

              <div className="grid grid-cols-2 gap-3">
                <InfoCard
                  label="Shipment ID"
                  value={`#${selectedShipment.shipment_id}`}
                />

                <InfoCard
                  label="Status"
                  value={selectedShipment.status.replaceAll(
                    "_",
                    " "
                  )}
                />

                <InfoCard
                  label="Weather"
                  value={
                    selectedShipment.weather
                      ?.replaceAll(
                        "_",
                        " "
                      ) || "NORMAL"
                  }
                />

                <InfoCard
                  label="Traffic"
                  value={
                    selectedShipment.traffic ||
                    "NORMAL"
                  }
                />

                <InfoCard
                  label="Disruptions"
                  value={String(
                    selectedShipment.active_disruptions
                  )}
                />

                <InfoCard
                  label="Route risk"
                  value={`${Math.round(
                    Number(
                      selectedShipment.route_risk ||
                        0
                    )
                  )}%`}
                />
              </div>

              {/* ML PREDICTION */}

              <div className="mt-5 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.025] p-5">
                <div className="flex items-center gap-2">
                  <ShieldAlert
                    size={16}
                    className="text-cyan-300"
                  />

                  <div className="text-[8px] font-bold tracking-[0.18em] text-cyan-300/70">
                    V2 ML PREDICTION
                  </div>
                </div>

                {predictionLoading ? (
                  <div className="mt-6 flex items-center gap-3 text-xs text-slate-500">
                    <RefreshCw
                      size={15}
                      className="animate-spin text-cyan-300"
                    />
                    Running shipment
                    prediction...
                  </div>
                ) : prediction?.prediction ? (
                  <>
                    <div className="mt-6 flex items-end justify-between">
                      <div>
                        <div className="text-4xl font-bold tracking-tight text-cyan-300">
                          {prediction.prediction.delay_probability_percentage.toFixed(
                            1
                          )}
                          %
                        </div>

                        <div className="mt-2 text-[8px] font-bold tracking-[0.12em] text-slate-600">
                          DELAY PROBABILITY
                        </div>
                      </div>

                      <span
                        className={`rounded-lg border px-3 py-2 text-[8px] font-bold ${riskClass(
                          prediction.prediction
                            .risk_level
                        )}`}
                      >
                        {
                          prediction.prediction
                            .risk_level
                        }
                      </span>
                    </div>

                    {/* PROBABILITY BAR */}

                    <div className="mt-6">
                      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={`h-full rounded-full ${
                            prediction
                              .prediction
                              .delay_probability_percentage >=
                            75
                              ? "bg-red-400"
                              : prediction
                                  .prediction
                                  .delay_probability_percentage >=
                                50
                              ? "bg-orange-300"
                              : prediction
                                  .prediction
                                  .delay_probability_percentage >=
                                25
                              ? "bg-yellow-300"
                              : "bg-cyan-300"
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(
                                0,
                                prediction
                                  .prediction
                                  .delay_probability_percentage
                              )
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mt-5 rounded-xl border border-red-400/10 bg-red-400/[0.03] p-4 text-[9px] text-slate-500">
                    Prediction data could
                    not be loaded.
                  </div>
                )}
              </div>

              {/* CONDITIONS */}

              {prediction?.conditions && (
                <div className="mt-5">
                  <div className="text-[8px] font-bold tracking-[0.18em] text-slate-600">
                    OPERATIONAL CONDITIONS
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <ConditionCard
                      label="Weather"
                      value={
                        prediction.conditions.weather
                      }
                      icon={
                        <CloudRain size={15} />
                      }
                    />

                    <ConditionCard
                      label="Traffic"
                      value={
                        prediction.conditions.traffic
                      }
                      icon={
                        <Route size={15} />
                      }
                    />

                    <ConditionCard
                      label="Disruptions"
                      value={String(
                        prediction.conditions
                          .active_disruptions
                      )}
                      icon={
                        <Zap size={15} />
                      }
                    />

                    <ConditionCard
                      label="Vehicle utilization"
                      value={`${(
                        prediction.conditions
                          .vehicle_utilization *
                        100
                      ).toFixed(1)}%`}
                      icon={
                        <Truck size={15} />
                      }
                    />
                  </div>
                </div>
              )}

              {/* RECOMMENDATIONS */}

              {prediction?.recommendations &&
                prediction.recommendations
                  .length > 0 && (
                  <div className="mt-5">
                    <div className="text-[8px] font-bold tracking-[0.18em] text-slate-600">
                      AI RECOMMENDATIONS
                    </div>

                    <div className="mt-3 space-y-2">
                      {prediction.recommendations.map(
                        (
                          recommendation,
                          index
                        ) => (
                          <div
                            key={index}
                            className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                          >
                            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-300/10 text-cyan-300">
                              <span className="text-[8px] font-bold">
                                {index + 1}
                              </span>
                            </div>

                            <div className="text-[9px] leading-5 text-slate-400">
                              {
                                recommendation
                              }
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

/* ============================================================
   MINI STAT
   ============================================================ */

function MiniStat({
  icon,
  value,
  label,
  danger = false,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
          danger
            ? "bg-red-400/10 text-red-300"
            : "bg-cyan-300/10 text-cyan-300"
        }`}
      >
        {icon}
      </div>

      <div className="mt-4 text-lg font-bold text-slate-100">
        {value}
      </div>

      <div className="mt-1 text-[7px] font-bold tracking-[0.1em] text-slate-600">
        {label}
      </div>
    </div>
  );
}

/* ============================================================
   FILTER SELECT
   ============================================================ */

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-[8px] font-bold tracking-[0.12em] text-slate-600">
        {label}
      </label>

      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="h-10 w-full rounded-lg border border-white/[0.07] bg-[#05080d] px-3 text-[9px] font-semibold text-slate-300 outline-none focus:border-cyan-300/30"
      >
        {options.map((option) => (
          <option
            key={option}
            value={option}
            className="bg-[#080d13]"
          >
            {option.replaceAll(
              "_",
              " "
            )}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ============================================================
   INFO CARD
   ============================================================ */

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="text-[7px] font-bold tracking-[0.12em] text-slate-700">
        {label}
      </div>

      <div className="mt-2 text-[10px] font-semibold capitalize text-slate-300">
        {value}
      </div>
    </div>
  );
}

/* ============================================================
   CONDITION CARD
   ============================================================ */

function ConditionCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 text-cyan-300/70">
        {icon}

        <span className="text-[7px] font-bold tracking-[0.1em] text-slate-600">
          {label}
        </span>
      </div>

      <div className="mt-3 text-[10px] font-semibold capitalize text-slate-300">
        {value.replaceAll(
          "_",
          " "
        )}
      </div>
    </div>
  );
}

/* ============================================================
   LOADING
   ============================================================ */

function LoadingState() {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="text-center">
        <RefreshCw
          size={25}
          className="mx-auto animate-spin text-cyan-300"
        />

        <div className="mt-4 text-xs font-semibold text-slate-400">
          Loading shipment intelligence...
        </div>

        <div className="mt-2 text-[8px] text-slate-700">
          Connecting to LogiShield API
        </div>
      </div>
    </div>
  );
}

/* ============================================================
    EMPTY
   ============================================================ */

function EmptyState({
  onClear,
}: {
  onClear: () => void;
}) {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.02] text-slate-600">
          <Search size={22} />
        </div>

        <div className="mt-5 text-sm font-semibold text-slate-400">
          No shipments found
        </div>

        <div className="mt-2 text-[9px] text-slate-700">
          Try changing your search or filters.
        </div>

        <button
          onClick={onClear}
          className="mt-5 rounded-lg border border-cyan-300/15 bg-cyan-300/5 px-4 py-2 text-[8px] font-bold text-cyan-300 hover:bg-cyan-300/10"
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}

/* ============================================================
    API ERROR
   ============================================================ */

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-[400px] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/[0.05] text-red-300">
          <AlertTriangle size={22} />
        </div>

        <div className="mt-5 text-sm font-semibold text-slate-200">
          API / database connection error
        </div>

        <div className="mt-2 break-words text-[9px] leading-5 text-slate-500">
          Shipment data could not be loaded from
          the LogiShield API. {message}
        </div>

        <button
          onClick={onRetry}
          className="mt-5 rounded-lg border border-cyan-300/15 bg-cyan-300/5 px-4 py-2 text-[8px] font-bold text-cyan-300 hover:bg-cyan-300/10"
        >
          Retry connection
        </button>
      </div>
    </div>
  );
}