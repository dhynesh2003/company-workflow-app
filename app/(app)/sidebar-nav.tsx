"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  Clock3,
  FileCheck2,
  History,
  ListChecks,
  ListTodo,
  Plus,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";

type AppRole =
  | "employee"
  | "reviewer"
  | "team_lead"
  | "admin"
  | "super_admin";

type SidebarNavProps = {
  role: AppRole | string;
  unread?: number;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: AppRole[];
  count?: number;
};

const superAdminItems: NavItem[] = [
  {
    href: "/super-admin/teams",
    label: "Teams Overview",
    icon: UsersRound,
    roles: ["super_admin"],
  },
  {
    href: "/super-admin/dashboard",
    label: "Company Overview",
    icon: BriefcaseBusiness,
    roles: ["super_admin"],
  },
];

const workspaceItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: BriefcaseBusiness,
    roles: ["employee", "reviewer", "team_lead", "admin"],
  },
  {
    href: "/my-work",
    label: "My Work",
    icon: ListTodo,
    roles: ["employee", "reviewer", "team_lead", "admin"],
  },
  {
    href: "/daily-log/new",
    label: "Daily Work Log",
    icon: ClipboardList,
    roles: ["employee", "reviewer", "team_lead", "admin"],
  },
  {
    href: "/my-timesheet",
    label: "My Timesheet",
    icon: Clock3,
    roles: ["employee", "reviewer", "team_lead", "admin"],
  },
  {
    href: "/notifications",
    label: "Notifications",
    icon: Bell,
    roles: ["employee", "reviewer", "team_lead", "admin"],
  },
];

const reviewItems: NavItem[] = [
  {
    href: "/reviews",
    label: "Review Queue",
    icon: FileCheck2,
    roles: ["reviewer", "team_lead", "admin"],
  },
  {
    href: "/admin/daily-logs",
    label: "Daily Logs to Check",
    icon: ListChecks,
    roles: ["reviewer", "team_lead", "admin"],
  },
];

const managementItems: NavItem[] = [
  {
    href: "/tasks/new",
    label: "Assign Task",
    icon: Plus,
    roles: ["team_lead", "admin"],
  },
  {
    href: "/team/dashboard",
    label: "Team Dashboard",
    icon: UsersRound,
    roles: ["team_lead"],
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: UserRound,
    roles: ["admin"],
  },
  {
    href: "/admin/teams",
    label: "Teams",
    icon: UsersRound,
    roles: ["team_lead", "admin"],
  },
  {
    href: "/admin/hierarchy",
    label: "Hierarchy",
    icon: ShieldCheck,
    roles: ["admin"],
  },
  {
    href: "/admin/tasks",
    label: "All Tasks",
    icon: ListChecks,
    roles: ["admin"],
  },
  {
    href: "/admin/work-categories",
    label: "Work Categories",
    icon: ClipboardList,
    roles: ["admin"],
  },
  {
    href: "/admin/reports",
    label: "Reports & Exports",
    icon: CalendarDays,
    roles: ["admin"],
  },
  {
    href: "/admin/audit-log",
    label: "Audit Log",
    icon: History,
    roles: ["admin"],
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Section({
  title,
  items,
  role,
  unread,
}: {
  title: string;
  items: NavItem[];
  role: AppRole | string;
  unread: number;
}) {
  const pathname = usePathname();

  const visible = items.filter(
    (item) => !item.roles || item.roles.includes(role as AppRole)
  );

  if (!visible.length) return null;

  return (
    <div className="nav-section">
      <div className="nav-section-title">{title}</div>

      <div className="nav-section-links">
        {visible.map((item) => {
          const active = isActive(pathname, item.href);
          const count =
            item.href === "/notifications" ? unread : item.count ?? 0;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link${active ? " active" : ""}`}
            >
              <span className="nav-icon" aria-hidden="true">
                <Icon size={18} strokeWidth={2} />
              </span>

              <span className="nav-label">{item.label}</span>

              {count > 0 && <span className="navcount">{count}</span>}

              {active && (
                <span className="nav-active-dot" aria-hidden="true" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function SidebarNav({ role, unread = 0 }: SidebarNavProps) {
  return (
    <nav className="sidebar-nav" aria-label="Main navigation">
      <Section
        title="Executive"
        items={superAdminItems}
        role={role}
        unread={unread}
      />

      <Section
        title="Workspace"
        items={workspaceItems}
        role={role}
        unread={unread}
      />

      <Section
        title="Review"
        items={reviewItems}
        role={role}
        unread={unread}
      />

      <Section
        title="Management"
        items={managementItems}
        role={role}
        unread={unread}
      />
    </nav>
  );
}