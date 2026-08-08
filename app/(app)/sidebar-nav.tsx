"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  icon: string;
  roles?: AppRole[];
  count?: number;
};

const superAdminItems: NavItem[] = [
  {
    href: "/super-admin/dashboard",
    label: "Company Overview",
    icon: "◈",
    roles: ["super_admin"],
  },
  {
    href: "/super-admin/teams",
    label: "Teams Overview",
    icon: "◫",
    roles: ["super_admin"],
  },
];

const workspaceItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "⌂",
    roles: [
      "employee",
      "reviewer",
      "team_lead",
      "admin",
    ],
  },
  {
    href: "/my-work",
    label: "My Work",
    icon: "✓",
    roles: [
      "employee",
      "reviewer",
      "team_lead",
      "admin",
    ],
  },
  {
    href: "/daily-log/new",
    label: "Daily Work Log",
    icon: "▤",
    roles: [
      "employee",
      "reviewer",
      "team_lead",
      "admin",
    ],
  },
  {
    href: "/my-timesheet",
    label: "My Timesheet",
    icon: "◷",
    roles: [
      "employee",
      "reviewer",
      "team_lead",
      "admin",
    ],
  },
  {
    href: "/notifications",
    label: "Notifications",
    icon: "♢",
    roles: [
      "employee",
      "reviewer",
      "team_lead",
      "admin",
    ],
  },
];

const reviewItems: NavItem[] = [
  {
    href: "/reviews",
    label: "Review Queue",
    icon: "◎",
    roles: [
      "reviewer",
      "team_lead",
      "admin",
    ],
  },
  {
    href: "/admin/daily-logs",
    label: "Daily Logs to Check",
    icon: "☑",
    roles: [
      "reviewer",
      "team_lead",
      "admin",
    ],
  },
];

const managementItems: NavItem[] = [
  {
    href: "/tasks/new",
    label: "Assign Task",
    icon: "+",
    roles: [
      "team_lead",
      "admin",
    ],
  },
  {
    href: "/team/dashboard",
    label: "Team Dashboard",
    icon: "◫",
    roles: ["team_lead"],
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: "◉",
    roles: ["admin"],
  },
  {
    href: "/admin/teams",
    label: "Teams",
    icon: "◆",
    roles: [
      "team_lead",
      "admin",
    ],
  },
  {
    href: "/admin/hierarchy",
    label: "Hierarchy",
    icon: "⌘",
    roles: ["admin"],
  },
  {
    href: "/admin/tasks",
    label: "All Tasks",
    icon: "▦",
    roles: ["admin"],
  },
  {
    href: "/admin/work-categories",
    label: "Work Categories",
    icon: "▥",
    roles: ["admin"],
  },
  {
    href: "/admin/reports",
    label: "Reports & Exports",
    icon: "↗",
    roles: ["admin"],
  },
  {
    href: "/admin/audit-log",
    label: "Audit Log",
    icon: "◌",
    roles: ["admin"],
  },
];

function isActive(
  pathname: string,
  href: string
) {
  return (
    pathname === href ||
    pathname.startsWith(
      `${href}/`
    )
  );
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

  const visible =
    items.filter(
      (item) =>
        !item.roles ||
        item.roles.includes(
          role as AppRole
        )
    );

  if (!visible.length) {
    return null;
  }

  return (
    <div className="nav-section">
      <div className="nav-section-title">
        {title}
      </div>

      <div className="nav-section-links">
        {visible.map((item) => {
          const active =
            isActive(
              pathname,
              item.href
            );

          const count =
            item.href ===
            "/notifications"
              ? unread
              : item.count ?? 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link${
                active
                  ? " active"
                  : ""
              }`}
            >
              <span
                className="nav-icon"
                aria-hidden="true"
              >
                {item.icon}
              </span>

              <span className="nav-label">
                {item.label}
              </span>

              {count > 0 && (
                <span className="navcount">
                  {count}
                </span>
              )}

              {active && (
                <span
                  className="nav-active-dot"
                  aria-hidden="true"
                />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function SidebarNav({
  role,
  unread = 0,
}: SidebarNavProps) {
  return (
    <nav
      className="sidebar-nav"
      aria-label="Main navigation"
    >
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