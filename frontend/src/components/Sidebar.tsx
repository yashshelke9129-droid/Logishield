"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Box,
  BrainCircuit,
  Gauge,
  GitBranch,
  Network,
  ShieldAlert,
  Zap,
} from "lucide-react";

const navigation = [
  {
    section: "CONTROL",
    items: [
      {
        name: "Command Center",
        href: "/",
        icon: Gauge,
      },
      {
        name: "Shipments",
        href: "/shipments",
        icon: Box,
        badge: "100,000",
      },
      {
        name: "Disruptions",
        href: "/disruptions",
        icon: ShieldAlert,
        badge: "3,000",
        badgeDanger: true,
      },
      {
        name: "Route Intelligence",
        href: "/routes",
        icon: GitBranch,
      },
    ],
  },
  {
    section: "INTELLIGENCE",
    items: [
      {
        name: "Forecasting",
        href: "/forecasting",
        icon: Activity,
      },
      {
        name: "Recovery Center",
        href: "/recovery",
        icon: Zap,
      },
      {
        name: "What-if Simulator",
        href: "/simulator",
        icon: BrainCircuit,
      },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[275px] flex-col border-r border-white/[0.07] bg-[#05090e]">

      {/* =====================================================
          LOGO
      ===================================================== */}

      <div className="flex h-[180px] items-center border-b border-white/[0.06] px-5">
        <Link
          href="/"
          className="flex items-center gap-3"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-300 text-[#061014] shadow-[0_0_30px_rgba(94,234,212,0.12)]">
            <Network size={23} />
          </div>

          <div>
            <div className="text-[16px] font-black tracking-[0.16em] text-slate-100">
              LOGISHIELD
            </div>

            <div className="mt-1 text-[7px] font-bold tracking-[0.18em] text-slate-600">
              LOGISTICS INTELLIGENCE
            </div>
          </div>
        </Link>
      </div>

      {/* =====================================================
          NETWORK STATUS
      ===================================================== */}

      <div className="px-4 pt-5">
        <div className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.025] p-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(94,234,212,0.8)]" />

            <span className="text-[9px] font-bold tracking-[0.12em] text-slate-300">
              NETWORK ONLINE
            </span>
          </div>

          <div className="mt-2 pl-4 text-[7px] font-bold tracking-[0.12em] text-cyan-300/50">
            V2 ML ENGINE ACTIVE
          </div>
        </div>
      </div>

      {/* =====================================================
          NAVIGATION
      ===================================================== */}

      <nav className="mt-7 flex-1 overflow-y-auto px-3">

        {navigation.map((group) => (
          <div
            key={group.section}
            className="mb-7"
          >

            {/* SECTION TITLE */}

            <div className="mb-3 px-3 text-[8px] font-bold tracking-[0.2em] text-slate-600">
              {group.section}
            </div>

            {/* NAVIGATION ITEMS */}

            <div className="space-y-1">

              {group.items.map((item) => {
                const Icon = item.icon;

                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`
                      group relative flex h-11 items-center gap-3 rounded-xl px-3 transition-all duration-200
                      ${
                        isActive
                          ? "border border-cyan-300/20 bg-cyan-300/[0.06] text-slate-100"
                          : "border border-transparent text-slate-500 hover:border-white/[0.05] hover:bg-white/[0.025] hover:text-slate-200"
                      }
                    `}
                  >

                    {/* ACTIVE INDICATOR */}

                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-cyan-300 shadow-[0_0_12px_rgba(94,234,212,0.8)]" />
                    )}

                    {/* ICON */}

                    <Icon
                      size={18}
                      strokeWidth={isActive ? 2 : 1.7}
                      className={
                        isActive
                          ? "text-cyan-300"
                          : "text-slate-500 transition group-hover:text-cyan-300"
                      }
                    />

                    {/* NAME */}

                    <span
                      className={`flex-1 text-[11px] font-semibold ${
                        isActive
                          ? "text-slate-100"
                          : ""
                      }`}
                    >
                      {item.name}
                    </span>

                    {/* BADGE */}

                    {item.badge && (
                      <span
                        className={`
                          rounded-md px-2 py-1 text-[7px] font-bold
                          ${
                            item.badgeDanger
                              ? "bg-red-400/10 text-red-300"
                              : isActive
                              ? "bg-cyan-300/10 text-cyan-300"
                              : "bg-white/[0.04] text-slate-600"
                          }
                        `}
                      >
                        {item.badge}
                      </span>
                    )}

                  </Link>
                );
              })}

            </div>
          </div>
        ))}

      </nav>

      {/* =====================================================
          MODEL STATUS
      ===================================================== */}

      <div className="p-4">

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">

          <div className="flex items-center justify-between">

            <span className="text-[8px] font-bold tracking-[0.16em] text-slate-600">
              MODEL
            </span>

            <span className="rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[7px] font-bold text-cyan-300">
              LIVE
            </span>

          </div>

          <div className="mt-4 text-[10px] font-bold text-slate-200">
            LogiShield-Delay-V2
          </div>

          <div className="mt-2 text-[7px] text-slate-600">
            Classification pipeline
          </div>

          <div className="mt-4 h-1 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full w-full rounded-full bg-cyan-300" />
          </div>

          <div className="mt-2 flex justify-between text-[7px] text-slate-700">
            <span>ML ENGINE</span>
            <span>7 categorical</span>
          </div>

        </div>

      </div>

    </aside>
  );
}