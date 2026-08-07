import Link from "next/link";
import type { ReactNode } from "react";

import {
  homeForRole,
  requireProfile,
} from "@/lib/auth";

import { signOut } from "./actions";
import SidebarNav from "./sidebar-nav";

type AppLayoutProps = {
  children: ReactNode;
};

function formatRole(role: string): string {
  return role.replaceAll("_", " ");
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) =>
      part.charAt(0).toUpperCase()
    )
    .join("");
}

export default async function AppLayout({
  children,
}: AppLayoutProps) {
  const { supabase, profile } =
    await requireProfile();

  const {
    count: unreadNotificationCount,
  } = await supabase
    .from("notifications")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("recipient_id", profile.id)
    .eq("is_read", false);

  const initials =
    getInitials(profile.full_name) || "U";

  const displayRole =
    formatRole(profile.role);

  const displayJobTitle =
    profile.job_title?.trim() ||
    displayRole;

  const notificationCount =
    unreadNotificationCount ?? 0;

  const homeHref =
    homeForRole(profile.role);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link
          href={homeHref}
          className="brand workflow-brand"
          aria-label="WorkFlow home"
        >
          <div className="workflow-logo-mark">
            <span className="workflow-w-left">
              W
            </span>

            <span
              className="workflow-node workflow-node-one"
              aria-hidden="true"
            />

            <span
              className="workflow-node workflow-node-two"
              aria-hidden="true"
            />

            <span
              className="workflow-check"
              aria-hidden="true"
            />
          </div>

          <div className="brand-text">
            <div className="brand-title">
              <span className="brand-work">
                Work
              </span>

              <span className="brand-flow">
                Flow
              </span>
            </div>

            <div className="brand-subtitle">
              Productivity suite
            </div>
          </div>
        </Link>

        <SidebarNav
          role={profile.role}
          unread={notificationCount}
        />

        <div className="sidebar-footer">
          <form action={signOut}>
            <button
              className="signout-btn"
              type="submit"
            >
              <span aria-hidden="true">
                ↗
              </span>

              <span>Sign out</span>
            </button>
          </form>

          <div className="sidebar-account">
            <div className="sidebar-avatar">
              {initials}
            </div>

            <div className="sidebar-account-copy">
              <strong>
                {profile.full_name}
              </strong>

              <span>
                {displayRole}
              </span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="page-wrap">
          <header className="user-header">
            <div className="user-header-left">
              <div className="user-header-avatar">
                {initials}
              </div>

              <div className="user-header-details">
                <span className="user-header-label">
                  Welcome back
                </span>

                <strong className="user-header-name">
                  {profile.full_name}
                </strong>

                <div className="user-header-meta">
                  <span>
                    {displayJobTitle}
                  </span>

                  {displayJobTitle.toLowerCase() !==
                    displayRole.toLowerCase() && (
                    <>
                      <span
                        className="user-header-divider"
                        aria-hidden="true"
                      >
                        •
                      </span>

                      <span>
                        {displayRole}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="user-header-right">
              {profile.role !==
                "super_admin" && (
                <Link
                  href="/notifications"
                  className="user-notification-button"
                  aria-label="Open notifications"
                >
                  <svg
                    width="21"
                    height="21"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    <path
                      d="M10 21h4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>

                  {notificationCount > 0 && (
                    <span className="notification-count">
                      {Math.min(
                        notificationCount,
                        99
                      )}
                    </span>
                  )}
                </Link>
              )}

              <div className="user-role-badge">
                <span
                  className="user-role-dot"
                  aria-hidden="true"
                />

                {displayRole}
              </div>
            </div>
          </header>

          <section className="page-content">
            {children}
          </section>
        </div>
      </main>
    </div>
  );
}