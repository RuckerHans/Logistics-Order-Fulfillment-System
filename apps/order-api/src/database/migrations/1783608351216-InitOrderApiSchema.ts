import { MigrationInterface, QueryRunner } from "typeorm";

export class InitOrderApiSchema1783608351216 implements MigrationInterface {
    name = 'InitOrderApiSchema1783608351216'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "order_api"."customers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "full_name" character varying(255) NOT NULL, "email" character varying(255) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_8536b8b85c06969f84f0c098b03" UNIQUE ("email"), CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "order_api"."order_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "order_id" uuid NOT NULL, "sku" character varying(50) NOT NULL, "qty" integer NOT NULL, "unit_price" numeric(10,2) NOT NULL, CONSTRAINT "CHK_46bd93eb22f1b9e485817fa953" CHECK ("unit_price" >= 0), CONSTRAINT "CHK_b92fec8668d71547482f1e5d2c" CHECK ("qty" > 0), CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_order_items_order_id" ON "order_api"."order_items" ("order_id") `);
        await queryRunner.query(`CREATE TABLE "order_api"."orders" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "customer_id" uuid NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'PLACED', "delivery_address" text NOT NULL, "branch_id" character varying(20) NOT NULL, "total_value" numeric(10,2) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_fc244d7f0f2795b3bf45091e77" CHECK ("total_value" >= 0), CONSTRAINT "CHK_f36ae2e49ccb39de4ec8f90130" CHECK ("status" IN ('PLACED','PAYMENT_CONFIRMED','PICKING','PACKED','SHIPPED','DELIVERED','CANCELLED')), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_orders_customer_id" ON "order_api"."orders" ("customer_id") `);
        await queryRunner.query(`CREATE INDEX "idx_orders_status" ON "order_api"."orders" ("status") `);
        await queryRunner.query(`ALTER TABLE "order_api"."order_items" ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY ("order_id") REFERENCES "order_api"."orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_api"."orders" ADD CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9" FOREIGN KEY ("customer_id") REFERENCES "order_api"."customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_api"."orders" DROP CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9"`);
        await queryRunner.query(`ALTER TABLE "order_api"."order_items" DROP CONSTRAINT "FK_145532db85752b29c57d2b7b1f1"`);
        await queryRunner.query(`DROP INDEX "order_api"."idx_orders_status"`);
        await queryRunner.query(`DROP INDEX "order_api"."idx_orders_customer_id"`);
        await queryRunner.query(`DROP TABLE "order_api"."orders"`);
        await queryRunner.query(`DROP INDEX "order_api"."idx_order_items_order_id"`);
        await queryRunner.query(`DROP TABLE "order_api"."order_items"`);
        await queryRunner.query(`DROP TABLE "order_api"."customers"`);
    }

}
