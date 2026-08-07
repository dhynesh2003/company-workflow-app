import { requireRole } from "@/lib/auth";
import { createEmployee, toggleUser } from "./actions";

type UsersPageProps={searchParams:Promise<{error?:string;created?:string;updated?:string}>};
function one<T>(value:T|T[]|null|undefined):T|null{return Array.isArray(value)?value[0]??null:value??null}

export default async function Users({searchParams}:UsersPageProps){
 const {supabase,profile}=await requireRole(["admin"]);const params=await searchParams;
 const [peopleResult,teamsResult]=await Promise.all([
  supabase.from("profiles").select("id,organization_id,full_name,email,job_title,role,team_id,manager_id,is_active,created_at,team:teams!profiles_team_id_fkey(id,name)").eq("organization_id",profile.organization_id).order("full_name"),
  supabase.from("teams").select("id,name").eq("organization_id",profile.organization_id).order("name")
 ]);
 const people=peopleResult.data??[],teams=teamsResult.data??[];const peopleById=new Map(people.map((p:any)=>[p.id,p]));
 const managers=people.filter((p:any)=>p.is_active&&["reviewer","team_lead","admin"].includes(p.role));
 return <div className="grid"><div><h1>Users</h1><p className="muted">Create staff accounts and define roles, teams and reporting managers.</p></div>
 {params.error&&<p className="error">{params.error}</p>}{params.created&&<p className="notice">Employee account created.</p>}{params.updated&&<p className="notice">User status updated.</p>}
 {peopleResult.error&&<p className="error">Unable to load users: {peopleResult.error.message}</p>}{teamsResult.error&&<p className="error">Unable to load teams: {teamsResult.error.message}</p>}
 <section className="card"><h2>Add employee</h2><form action={createEmployee} className="form"><div className="grid grid2">
  <label className="label">Full name<input className="input" name="full_name" required/></label><label className="label">Email<input className="input" name="email" type="email" required/></label>
  <label className="label">Temporary password<input className="input" name="password" type="password" minLength={8} required/></label><label className="label">Job title<input className="input" name="job_title"/></label>
  <label className="label">Role<select className="select" name="role" defaultValue="employee"><option value="employee">Employee</option><option value="reviewer">Reviewer</option><option value="team_lead">Team lead</option><option value="admin">Admin</option></select></label>
  <label className="label">Team<select className="select" name="team_id" defaultValue=""><option value="">No team</option>{teams.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
  <label className="label">Reports to<select className="select" name="manager_id" defaultValue=""><option value="">No manager</option>{managers.map((m:any)=><option key={m.id} value={m.id}>{m.full_name} — {m.role.replaceAll("_"," ")}{m.id===profile.id?" — You":""}</option>)}</select></label>
 </div><button className="btn">Create account</button></form></section>
 <section className="card tablewrap"><table className="table"><thead><tr><th>Name</th><th>Job title</th><th>Role</th><th>Team</th><th>Manager</th><th>Status</th><th>Action</th></tr></thead><tbody>{people.map((p:any)=>{const team=one(p.team);const manager=p.manager_id?peopleById.get(p.manager_id) as any:null;return <tr key={p.id}><td><strong>{p.full_name}</strong><div className="muted">{p.email}</div></td><td>{p.job_title||"—"}</td><td><span className="badge">{p.role.replaceAll("_"," ")}</span></td><td>{team?.name||"—"}</td><td>{manager?.full_name||"—"}</td><td>{p.is_active?"Active":"Inactive"}</td><td>{p.id!==profile.id?<form action={toggleUser}><input type="hidden" name="id" value={p.id}/><input type="hidden" name="active" value={String(p.is_active)}/><button className={`btn ${p.is_active?"danger":"success"}`}>{p.is_active?"Deactivate":"Activate"}</button></form>:<span className="muted">Current account</span>}</td></tr>})}{!peopleResult.error&&!people.length&&<tr><td colSpan={7}>No users found.</td></tr>}</tbody></table></section></div>;
}
