"use client";

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Clock3,
  CloudRain,
  GitBranch,
  RefreshCw,
  Route,
  ShieldAlert,
  Truck,
  Zap,
} from "lucide-react";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type SimulationResponse = {
  status: string;
  simulation_engine: string;
  scenario: {
    disruption_type: string;
    severity: Severity;
    disruption_probability_percentage: number;
    traffic_impact_percentage: number;
    weather_impact_percentage: number;
    route_exposure_percentage: number;
  };
  baseline: {
    total_shipments: number;
    average_delay_probability_percentage: number;
    critical_shipments: number;
    network_risk: number;
    route_availability: number;
    available_vehicles: number;
    total_vehicles: number;
  };
  impact: {
    projected_delay_percentage: number;
    delay_change_points: number;
    projected_critical_shipments: number;
    critical_shipment_change: number;
    affected_shipments: number;
    affected_percentage: number;
    network_risk: number;
    network_risk_change: number;
    estimated_delay_hours: number;
    route_availability: number;
    vehicles_potentially_required: number;
  };
  economics: {
    estimated_cost_exposure: number;
    recovery_investment: number;
    potential_savings: number;
  };
  recommendation: {
    action: string;
    reason: string;
  };
};

const disruptionTypes = [
  "TRAFFIC_CONGESTION",
  "HEAVY_RAIN",
  "VEHICLE_BREAKDOWN",
  "ROAD_CLOSURE",
  "SUPPLIER_DELAY",
  "FLOOD",
  "WAREHOUSE_FAILURE",
  "LABOUR_SHORTAGE",
  "CYCLONE",
];

const severityOptions: Severity[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

const defaultValues = {
  disruptionType: "TRAFFIC_CONGESTION",
  severity: "HIGH" as Severity,
  probability: 63,
  traffic: 55,
  weather: 20,
  route: 35,
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(Math.round(value || 0));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatPercent(value: number) {
  return `${(value || 0).toFixed(1)}%`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function SimulatorPage() {
  const [disruptionType, setDisruptionType] = useState(
    defaultValues.disruptionType
  );
  const [severity, setSeverity] = useState<Severity>(
    defaultValues.severity
  );
  const [probability, setProbability] = useState(
    defaultValues.probability
  );
  const [traffic, setTraffic] = useState(defaultValues.traffic);
  const [weather, setWeather] = useState(defaultValues.weather);
  const [route, setRoute] = useState(defaultValues.route);

  const [data, setData] = useState<SimulationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");

  const runSimulation = useCallback(async () => {
    setLoading(true);
    setApiError("");

    try {
      const payload = await apiFetch<SimulationResponse>(
        "/api/v1/simulator/scenario",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            disruption_type: disruptionType,
            severity,
            disruption_probability: probability / 100,
            traffic_impact: traffic / 100,
            weather_impact: weather / 100,
            route_exposure: route / 100,
          }),
        }
      );

      setData(payload);
    } catch (error) {
      setApiError(
        error instanceof Error
          ? error.message
          : "Unable to connect to the LogiShield simulation engine."
      );
    } finally {
      setLoading(false);
    }
  }, [
    disruptionType,
    severity,
    probability,
    traffic,
    weather,
    route,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      runSimulation();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [runSimulation]);

  const resetScenario = () => {
    setDisruptionType(defaultValues.disruptionType);
    setSeverity(defaultValues.severity);
    setProbability(defaultValues.probability);
    setTraffic(defaultValues.traffic);
    setWeather(defaultValues.weather);
    setRoute(defaultValues.route);
  };

  const statusLabel = loading
    ? "SIMULATING"
    : apiError
      ? "API OFFLINE"
      : "SIMULATION ENGINE LIVE";

  const statusClass = apiError
    ? "border-red-500/20 bg-red-500/5 text-red-300"
    : loading
      ? "border-cyan-400/20 bg-cyan-400/5 text-cyan-300"
      : "border-cyan-400/20 bg-cyan-400/5 text-cyan-300";

  const severityColor =
    severity === "CRITICAL"
      ? "text-red-400"
      : severity === "HIGH"
        ? "text-orange-300"
        : severity === "MEDIUM"
          ? "text-cyan-300"
          : "text-slate-300";

  const metricCards = useMemo(() => {
    if (!data) {
      return [];
    }

    return [
      {
        label: "Projected Delay",
        value: formatPercent(data.impact.projected_delay_percentage),
        delta: `${data.impact.delay_change_points >= 0 ? "+" : ""}${data.impact.delay_change_points.toFixed(1)} pts`,
        icon: Activity,
      },
      {
        label: "Critical Shipments",
        value: formatNumber(
          data.impact.projected_critical_shipments
        ),
        delta: `${data.impact.critical_shipment_change >= 0 ? "+" : ""}${formatNumber(data.impact.critical_shipment_change)}`,
        icon: ShieldAlert,
      },
      {
        label: "Affected Shipments",
        value: formatNumber(data.impact.affected_shipments),
        delta: `${formatPercent(data.impact.affected_percentage)} of network`,
        icon: Truck,
      },
      {
        label: "Network Risk",
        value: formatPercent(data.impact.network_risk),
        delta: `Base ${formatPercent(data.baseline.network_risk)}`,
        icon: Zap,
      },
    ];
  }, [data]);

  return (
    <main className="min-h-screen bg-[#03070a] text-white">
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#03070a]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[88px] max-w-[1600px] items-center justify-between px-6 lg:px-10">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-[#071016] text-slate-300 transition hover:border-cyan-400/30 hover:text-cyan-300"
              aria-label="Go back"
            >
              <ArrowLeft size={21} />
            </button>

            <div>
              <div className="text-[10px] font-bold tracking-[0.28em] text-cyan-400">
                LOGISHIELD · SCENARIO INTELLIGENCE
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                What-if Simulator
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`hidden items-center gap-2 rounded-xl border px-4 py-2.5 text-[11px] font-bold tracking-[0.12em] sm:flex ${statusClass}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  apiError
                    ? "bg-red-400"
                    : "bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,.7)]"
                }`}
              />
              {statusLabel}
            </div>

            <button
              type="button"
              onClick={runSimulation}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#071016] px-4 py-2.5 text-sm text-slate-300 transition hover:border-cyan-400/30 hover:text-white disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={loading ? "animate-spin" : ""}
              />
              Refresh
            </button>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-300 text-xs font-black text-[#031016]">
              LS
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-6 py-8 lg:px-10">
        {apiError && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/[0.04] px-5 py-4 text-sm text-red-300">
            <div className="flex items-center gap-3">
              <AlertTriangle size={18} />
              <span>{apiError}</span>
            </div>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-white/[0.07] bg-[#060d12] p-7">
            <div className="mb-8">
              <div className="text-[10px] font-bold tracking-[0.25em] text-cyan-400">
                SCENARIO CONTROL
              </div>
              <h2 className="mt-2 text-xl font-semibold">
                Configure disruption
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Adjust the scenario inputs. Results are calculated
                against the current PostgreSQL-backed network.
              </p>
            </div>

            <label className="mb-2 block text-sm text-slate-400">
              Disruption Type
            </label>

            <select
              value={disruptionType}
              onChange={(event) =>
                setDisruptionType(event.target.value)
              }
              className="mb-7 w-full rounded-xl border border-white/[0.08] bg-[#03080c] px-4 py-3.5 text-sm font-semibold text-white outline-none transition focus:border-cyan-400/50"
            >
              {disruptionTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll("_", " ")}
                </option>
              ))}
            </select>

            <div className="mb-8">
              <div className="mb-3 text-sm text-slate-400">
                Severity
              </div>

              <div className="grid grid-cols-4 gap-2">
                {severityOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSeverity(option)}
                    className={`rounded-xl border px-2 py-3 text-xs font-semibold transition ${
                      severity === option
                        ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-300"
                        : "border-white/[0.07] bg-[#071016] text-slate-500 hover:text-slate-200"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <SliderControl
              label="Disruption Probability"
              value={probability}
              onChange={setProbability}
              accent={severityColor}
            />

            <SliderControl
              label="Traffic Impact"
              value={traffic}
              onChange={setTraffic}
              icon={<GitBranch size={15} />}
            />

            <SliderControl
              label="Weather Impact"
              value={weather}
              onChange={setWeather}
              icon={<CloudRain size={15} />}
            />

            <SliderControl
              label="Route Exposure"
              value={route}
              onChange={setRoute}
              icon={<Route size={15} />}
            />

            <button
              type="button"
              onClick={resetScenario}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-[#071016] px-4 py-3.5 text-sm text-slate-300 transition hover:border-cyan-400/30 hover:text-white"
            >
              <RefreshCw size={16} />
              Reset Scenario
            </button>
          </section>

          <section className="min-w-0">
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
              {metricCards.map((metric) => {
                const Icon = metric.icon;

                return (
                  <MetricCard
                    key={metric.label}
                    label={metric.label}
                    value={metric.value}
                    delta={metric.delta}
                    icon={<Icon size={19} />}
                  />
                );
              })}
            </div>

            <section className="mt-6 rounded-2xl border border-white/[0.07] bg-[#060d12] p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold tracking-[0.25em] text-cyan-400">
                    IMPACT ANALYSIS
                  </div>
                  <h2 className="mt-2 text-xl font-semibold">
                    Projected network consequences
                  </h2>
                </div>

                <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] px-4 py-2 text-[10px] font-bold tracking-[0.12em] text-cyan-300">
                  SCENARIO ACTIVE
                </div>
              </div>

              <div className="mt-7 grid gap-5 md:grid-cols-2">
                <ImpactCard
                  label="Estimated delay duration"
                  value={
                    data
                      ? `${data.impact.estimated_delay_hours.toFixed(1)} hours`
                      : "—"
                  }
                  progress={
                    data
                      ? clamp(
                          data.impact.estimated_delay_hours * 5,
                          0,
                          100
                        )
                      : 0
                  }
                  icon={<Activity size={19} />}
                />

                <ImpactCard
                  label="Route availability"
                  value={
                    data
                      ? formatPercent(
                          data.impact.route_availability
                        )
                      : "—"
                  }
                  progress={
                    data
                      ? data.impact.route_availability
                      : 0
                  }
                  icon={<Route size={19} />}
                />

                <ImpactCard
                  label="Additional critical exposure"
                  value={
                    data
                      ? formatNumber(
                          data.impact.critical_shipment_change
                        )
                      : "—"
                  }
                  progress={
                    data
                      ? clamp(
                          (data.impact.critical_shipment_change /
                            Math.max(
                              1,
                              data.baseline.total_shipments
                            )) *
                            100 *
                            3,
                          0,
                          100
                        )
                      : 0
                  }
                  icon={<ShieldAlert size={19} />}
                />

                <ImpactCard
                  label="Vehicles potentially required"
                  value={
                    data
                      ? formatNumber(
                          data.impact.vehicles_potentially_required
                        )
                      : "—"
                  }
                  progress={
                    data
                      ? clamp(
                          (data.impact.vehicles_potentially_required /
                            Math.max(
                              1,
                              data.baseline.total_vehicles
                            )) *
                            100,
                          0,
                          100
                        )
                      : 0
                  }
                  icon={<Truck size={19} />}
                />
              </div>
            </section>

            <div className="mt-6 grid gap-5 lg:grid-cols-3">
              <FinancialCard
                label="Estimated Cost Exposure"
                value={
                  data
                    ? formatCurrency(
                        data.economics.estimated_cost_exposure
                      )
                    : "—"
                }
                icon={<BarChart3 size={19} />}
              />

              <FinancialCard
                label="Recovery Investment"
                value={
                  data
                    ? formatCurrency(
                        data.economics.recovery_investment
                      )
                    : "—"
                }
                icon={<Zap size={19} />}
              />

              <FinancialCard
                label="Potential Savings"
                value={
                  data
                    ? formatCurrency(
                        data.economics.potential_savings
                      )
                    : "—"
                }
                icon={<Activity size={19} />}
              />
            </div>

            <section className="mt-6 rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-400/[0.05] to-transparent p-7">
              <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
                <div>
                  <div className="text-[10px] font-bold tracking-[0.25em] text-amber-400">
                    RECOVERY RECOMMENDATION
                  </div>

                  <h2 className="mt-2 text-2xl font-semibold">
                    {data?.recommendation.action ||
                      "Calculating intervention strategy..."}
                  </h2>

                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
                    {data?.recommendation.reason ||
                      "The simulation engine is calculating the projected operational impact."}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] px-5 py-4">
                  <ShieldAlert
                    size={20}
                    className="text-amber-400"
                  />
                  <div>
                    <div className="text-[10px] tracking-[0.14em] text-slate-500">
                      SIMULATION IMPACT
                    </div>
                    <div className="mt-1 font-semibold text-amber-300">
                      {data
                        ? formatPercent(
                            data.impact.network_risk
                          )
                        : "—"}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-5 md:grid-cols-3">
              <MiniStat
                label="Baseline Delay"
                value={
                  data
                    ? formatPercent(
                        data.baseline
                          .average_delay_probability_percentage
                      )
                    : "—"
                }
              />

              <MiniStat
                label="Current Network Risk"
                value={
                  data
                    ? formatPercent(
                        data.baseline.network_risk
                      )
                    : "—"
                }
              />

              <MiniStat
                label="Available Vehicles"
                value={
                  data
                    ? `${formatNumber(
                        data.baseline.available_vehicles
                      )} / ${formatNumber(
                        data.baseline.total_vehicles
                      )}`
                    : "—"
                }
              />
            </section>
          </section>
        </div>
      </div>
    </main>
  );
}

function SliderControl({
  label,
  value,
  onChange,
  icon,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  accent?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="mb-7">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          {icon || <Activity size={15} />}
          {label}
        </div>

        <span className="font-semibold text-cyan-300">
          {value}%
        </span>
      </div>

      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={value}
        onChange={(event) =>
          onChange(Number(event.target.value))
        }
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-cyan-400"
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  delta,
  icon,
}: {
  label: string;
  value: string;
  delta: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#060d12] p-6">
      <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/[0.08] text-cyan-300">
        {icon}
      </div>

      <div className="text-sm text-slate-500">
        {label}
      </div>

      <div className="mt-2 text-3xl font-bold tracking-tight">
        {value}
      </div>

      <div className="mt-2 text-xs text-slate-600">
        {delta}
      </div>
    </div>
  );
}

function ImpactCard({
  label,
  value,
  progress,
  icon,
}: {
  label: string;
  value: string;
  progress: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#091117] p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/[0.08] text-cyan-300">
            {icon}
          </div>

          <span className="text-sm text-slate-400">
            {label}
          </span>
        </div>

        <strong className="text-sm font-semibold">
          {value}
        </strong>
      </div>

      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className="h-full rounded-full bg-cyan-300 transition-all duration-300"
          style={{
            width: `${clamp(progress, 0, 100)}%`,
          }}
        />
      </div>
    </div>
  );
}

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
    <div className="rounded-2xl border border-white/[0.07] bg-[#060d12] p-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/[0.08] text-cyan-300">
        {icon}
      </div>

      <div className="mt-5 text-sm text-slate-500">
        {label}
      </div>

      <div className="mt-3 break-all text-2xl font-bold tracking-tight">
        {value}
      </div>

      <div className="mt-2 text-xs text-slate-600">
        Scenario projection
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#060d12] px-5 py-4">
      <div className="text-[10px] font-bold tracking-[0.16em] text-slate-600">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold">
        {value}
      </div>
    </div>
  );
}