import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOutboxAndTraceId1783610612755 implements MigrationInterface {
    name = 'AddOutboxAndTraceId1783610612755'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "order_api"."outbox" ("id" BIGSERIAL NOT NULL, "channel" character varying(20) NOT NULL, "routing_key" character varying(100) NOT NULL, "aggregate_type" character varying(50) NOT NULL DEFAULT 'order', "aggregate_id" uuid NOT NULL, "event_type" character varying(50) NOT NULL, "payload" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "published_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "CHK_e8d953a7d663ee773bfb4a877e" CHECK ("channel" IN ('kafka','rabbitmq')), CONSTRAINT "PK_340ab539f309f03bdaa14aa7649" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_outbox_unpublished" ON "order_api"."outbox" ("created_at") WHERE "published_at" IS NULL`);
        await queryRunner.query(`ALTER TABLE "order_api"."orders" ADD "trace_id" uuid NOT NULL DEFAULT gen_random_uuid()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_api"."orders" DROP COLUMN "trace_id"`);
        await queryRunner.query(`DROP INDEX "order_api"."idx_outbox_unpublished"`);
        await queryRunner.query(`DROP TABLE "order_api"."outbox"`);
    }

}
