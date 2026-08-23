export interface HealthStatus {
  status: "ok" | "degraded";
  database: "up" | "down";
  /** Segundos que lleva vivo el proceso. */
  uptime: number;
  timestamp: string;
}

/** Contrato del informe de estado de la API y sus dependencias. */
export interface IHealthService {
  check(): Promise<HealthStatus>;
}
