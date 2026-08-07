export function FlashMessage({ type = "success", children }: { type?: "success" | "error" | "info"; children: React.ReactNode }) {
  return <div className={`flash flash-${type}`} role={type === "error" ? "alert" : "status"}>{children}</div>;
}
