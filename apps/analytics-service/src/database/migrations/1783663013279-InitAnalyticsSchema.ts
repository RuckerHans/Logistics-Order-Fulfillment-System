import { MigrationInterface, QueryRunner } from "typeorm";

export class InitAnalyticsSchema1783663013279 implements MigrationInterface {
    name = 'InitAnalyticsSchema1783663013279'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "analytics"."order_status_events" ("id" BIGSERIAL NOT NULL, "order_id" uuid NOT NULL, "branch_id" character varying(20) NOT NULL, "previous_status" character varying(20), "new_status" character varying(20) NOT NULL, "order_value" numeric(10,2) NOT NULL, "event_timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "ingested_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_analytics_order_status" UNIQUE ("order_id", "new_status"), CONSTRAINT "PK_cee8187701a1f5ca1d3780f89dc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_analytics_events_branch" ON "analytics"."order_status_events" ("branch_id") `);
        await queryRunner.query(`CREATE INDEX "idx_analytics_events_status" ON "analytics"."order_status_events" ("new_status") `);
        await queryRunner.query(`CREATE INDEX "idx_analytics_events_timestamp" ON "analytics"."order_status_events" ("event_timestamp") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "analytics"."idx_analytics_events_timestamp"`);
        await queryRunner.query(`DROP INDEX "analytics"."idx_analytics_events_status"`);
        await queryRunner.query(`DROP INDEX "analytics"."idx_analytics_events_branch"`);
        await queryRunner.query(`DROP TABLE "analytics"."order_status_events"`);
    }

}
