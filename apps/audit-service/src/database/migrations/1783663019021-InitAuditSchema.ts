import { MigrationInterface, QueryRunner } from "typeorm";

export class InitAuditSchema1783663019021 implements MigrationInterface {
    name = 'InitAuditSchema1783663019021'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "audit"."order_status_log" ("id" BIGSERIAL NOT NULL, "order_id" uuid NOT NULL, "customer_id" uuid NOT NULL, "previous_status" character varying(20), "new_status" character varying(20) NOT NULL, "delivery_address" text NOT NULL, "order_value" numeric(10,2) NOT NULL, "items" jsonb NOT NULL, "branch_id" character varying(20) NOT NULL, "event_timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_audit_order_status" UNIQUE ("order_id", "new_status"), CONSTRAINT "PK_cb57f320f79b86ff79cc2200630" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_audit_order_id" ON "audit"."order_status_log" ("order_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "audit"."idx_audit_order_id"`);
        await queryRunner.query(`DROP TABLE "audit"."order_status_log"`);
    }

}
