import { MigrationInterface, QueryRunner } from "typeorm";

export class InitNotificationSchema1783647824582 implements MigrationInterface {
    name = 'InitNotificationSchema1783647824582'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "notification"."notification_log" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "order_id" uuid NOT NULL, "customer_id" uuid NOT NULL, "type" character varying(30) NOT NULL, "channel" character varying(10) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'SENT', "sent_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_2d241d3ac00a0f1ba57bab9079" CHECK ("status" IN ('SENT','FAILED')), CONSTRAINT "CHK_40a4a4e9b304a172488a65fa89" CHECK ("channel" IN ('EMAIL','SMS')), CONSTRAINT "PK_6f761cfbbd064e0f326960877d6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_notification_log_order_id" ON "notification"."notification_log" ("order_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "notification"."idx_notification_log_order_id"`);
        await queryRunner.query(`DROP TABLE "notification"."notification_log"`);
    }

}
