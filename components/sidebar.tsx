import Link from "next/link";
import { logout } from "@/app/(app)/actions";
import type { Profile } from "@/lib/types";

export function Sidebar({profile,unread=0}:{profile:Profile;unread?:number}){
  const canManage=["admin","team_lead"].includes(profile.role);
  const canReview=["admin","team_lead","reviewer"].includes(profile.role);
  return <aside className="sidebar">
    <div className="brand">WorkFlow</div>
    <nav className="nav">
      <Link href="/dashboard">Dashboard</Link>
      <Link href="/my-work">My Work</Link>
      <Link href="/daily-log/new">Daily Work Log</Link>
      <Link href="/my-timesheet">My Timesheet</Link>
      <Link href="/notifications">Notifications {unread>0&&<span className="navcount">{unread}</span>}</Link>
      {canReview&&<Link href="/reviews">Review Queue</Link>}
      {canManage&&<Link href="/tasks/new">Assign Task</Link>}
      {canReview&&<Link href="/admin/daily-logs">Daily Logs to Check</Link>}
      {profile.role==="team_lead"&&<Link href="/team/dashboard">Team Dashboard</Link>}
      {profile.role==="admin"&&<>
        <Link href="/admin/users">Users</Link>
        <Link href="/admin/teams">Teams</Link>
        <Link href="/admin/hierarchy">Hierarchy</Link>
        <Link href="/admin/tasks">All Tasks</Link>
        <Link href="/admin/work-categories">Work Categories</Link>
        <Link href="/admin/reports">Reports & Exports</Link>
        <Link href="/admin/audit-log">Audit Log</Link>
      </>}
      <form action={logout}><button className="btn secondary" style={{width:"100%",marginTop:20}}>Sign out</button></form>
    </nav>
  </aside>;
}
