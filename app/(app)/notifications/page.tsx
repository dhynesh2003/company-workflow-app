import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { markAllNotificationsRead,markNotificationRead } from "./actions";
export default async function Notifications(){
 const {supabase,profile}=await requireProfile();
 const {data,error}=await supabase.from("notifications").select("id,title,message,href,is_read,created_at,notification_type").eq("recipient_id",profile.id).order("created_at",{ascending:false}).limit(100);
 const rows=data??[];
 return <div className="grid"><div className="between"><div><h1>Notifications</h1><p className="muted">Items that need your attention.</p></div><form action={markAllNotificationsRead}><button className="btn secondary">Mark all read</button></form></div>
 {error&&<p className="error">Unable to load notifications: {error.message}</p>}
 <section className="card notificationList">{rows.map((n:any)=><article className={`notificationItem ${n.is_read?"":"unread"}`} key={n.id}><div><strong>{n.title}</strong><p>{n.message}</p><small className="muted">{new Date(n.created_at).toLocaleString()}</small></div><div className="actions">{n.href&&<Link className="btn secondary" href={n.href}>Open</Link>}{!n.is_read&&<form action={markNotificationRead}><input type="hidden" name="id" value={n.id}/><button className="btn">Mark read</button></form>}</div></article>)}{!rows.length&&<div className="empty">No notifications yet.</div>}</section></div>;
}
