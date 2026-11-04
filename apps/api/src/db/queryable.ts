/** A DataSource or a transaction's EntityManager. */
export type Queryable = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(sql: string, parameters?: unknown[]): Promise<any>;
};

/** TypeORM answers UPDATE and DELETE ... RETURNING with [rows, affectedCount]. */
export const returnedRows = <T>(result: [T[], number]): T[] => result[0];
