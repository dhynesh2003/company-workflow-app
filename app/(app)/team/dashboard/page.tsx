import { requireRole } from "@/lib/auth";
export default async function TeamDashboard(){
 const {supabase,profile}=await requireRole(["team_lead","admin"]);
 let membersQ=supabase.from("profiles").select("id,full_name,role,is_active").eq("organization_id",profile.organization_id);
 let tasksQ=supabase.from("tasks").select("id,title,status,assigned_to,due_date").eq("organization_id",profile.organization_id);
 if(profile.role==="team_lead"&&profile.team_id){membersQ=membersQ.eq("team_id",profile.team_id);tasksQ=tasksQ.eq("team_id",profile.team_id)}
 const today=new Date().toISOString().slice(0,10);
 const [membersRes,tasksRes,logsRes]=await Promise.all([membersQ.order("full_name"),tasksQ, supabase.from("daily_logs").select("employee_id,status,total_minutes").eq("organization_id",profile.organization_id).eq("work_date",today)]);
 const members=membersRes.data??[],tasks=tasksRes.data??[],logs=logsRes.data??[];const logMap=new Map(logs.map((x:any)=>[x.employee_id,x]));
 return <div className="grid"><div><h1>Team Dashboard</h1><p className="muted">Today’s team workload and daily-log status.</p></div><section className="card tablewrap"><table className="table"><thead><tr><th>Employee</th><th>Active tasks</th><th>Waiting review</th><th>Overdue</th><th>Daily log</th></tr></thead><tbody>{members.map((m:any)=>{const own=tasks.filter((t:any)=>t.assigned_to===m.id);const overdue=own.filter((t:any)=>t.due_date&&new Date(t.due_date)<new Date()&&!['completed','cancelled'].includes(t.status)).length;const wait=own.filter((t:any)=>['submitted','under_review','changes_requested'].includes(t.status)).length;const log=logMap.get(m.id) as any;return <tr key={m.id}><td><strong>{m.full_name}</strong><div className="muted">{m.role.replaceAll("_"," ")}</div></td><td>{own.filter((t:any)=>!['completed','cancelled'].includes(t.status)).length}</td><td>{wait}</td><td>{overdue}</td><td>{log?log.status.replaceAll("_"," "):"Missing"}</td></tr>})}</tbody></table></section></div>;
}
