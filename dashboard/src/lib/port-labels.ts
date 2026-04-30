/** Human-readable labels for common listening ports (mock-style service column). */
export function serviceLabelForPort(port: number): string {
  const m: Record<number, string> = {
    22: "SSH",
    80: "HTTP",
    443: "HTTPS",
    8080: "HTTP gateway",
    8443: "HTTPS alt",
    3000: "Node / dev",
    5173: "Vite dev",
    5432: "PostgreSQL",
    6379: "Redis",
    9090: "VersionGate API",
    27017: "MongoDB",
  };
  return m[port] ?? "Service";
}
