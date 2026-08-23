/** Contrato minimo para comprobar que la base de datos responde. */
export interface IHealthRepository {
  /** true si la BD contesta, false si falla o agota el timeout. Nunca lanza. */
  ping(): Promise<boolean>;
}
