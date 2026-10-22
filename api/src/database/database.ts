import { Logger } from "@nestjs/common";
import { DataSource, MigrationExecutor, type QueryRunner } from "typeorm";
import { fileURLToPath } from "node:url";

export function createDatabase(url: string, migrations = fileURLToPath(new URL("./migrations/*.js", import.meta.url))): DataSource {
  try {
    const address = new URL(url);
    if (!["postgres:", "postgresql:"].includes(address.protocol) || !address.hostname || !address.username || address.pathname.length < 2) throw new Error();
  } catch { throw new Error("Invalid RECAP_DATABASE_URL"); }
  return new DataSource({
    type: "postgres", url, schema: "recap", applicationName: "recap-api",
    synchronize: false, migrationsRun: false, installExtensions: false,
    migrations: [migrations], migrationsTableName: "migrations", migrationsTransactionMode: "all",
    poolSize: 5, connectTimeoutMS: 5_000, logging: false,
    // TypeORM의 기본 마이그레이션 오류 출력에도 원문 메시지가 포함된다.
    // 초기화 실패는 아래에서 정제된 오류로 전달하며 SQL과 파라미터는 출력하지 않는다.
    logger: {
      logQuery() {}, logSchemaBuild() {}, logMigration() {}, log() {},
      logQueryError() { Logger.error("Database query failed", "RecapDatabase"); },
      logQuerySlow() { Logger.warn("Database query slow", "RecapDatabase"); },
    },
    extra: { statement_timeout: 15_000, idle_in_transaction_session_timeout: 15_000 },
    poolErrorHandler: () => Logger.error("Database connection unavailable", "RecapDatabase"),
  });
}

export async function initializeDatabase(source: DataSource): Promise<void> {
  try {
    await source.initialize();
    if (!source.migrations.length) throw new Error("No migrations packaged");
    const runner: QueryRunner = source.createQueryRunner();
    let locked = false;
    try {
      await runner.connect();
      await runner.query("SET lock_timeout = '5s'");
      // 같은 DB를 사용하는 Pod의 마이그레이션을 전용 락으로 직렬화한다.
      await runner.query("SELECT pg_advisory_lock(1792633627, 1)");
      locked = true;
      // TypeORM 이력 테이블 생성 전에 전용 스키마가 필요하다.
      await runner.query("CREATE SCHEMA IF NOT EXISTS recap");
      const executor = new MigrationExecutor(source, runner);
      executor.transaction = "all";
      await executor.executePendingMigrations();
    } finally {
      try {
        if (locked) await runner.query("SELECT pg_advisory_unlock(1792633627, 1)");
      } finally {
        await runner.release();
      }
    }
  } catch {
    if (source.isInitialized) {
      try { await source.destroy(); }
      catch { Logger.error("Database cleanup failed", "RecapDatabase"); }
    }
    // DSN이나 SQL 파라미터를 포함하는 driver 예외를 외부 로그에 전달하지 않는다.
    throw new Error("Recap database initialization failed");
  }
}
