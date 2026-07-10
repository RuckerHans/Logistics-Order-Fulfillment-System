import { MigrationInterface, QueryRunner } from "typeorm";

export class InitInventorySchema1783647719250 implements MigrationInterface {
    name = 'InitInventorySchema1783647719250'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "inventory"."stock" ("sku" character varying(50) NOT NULL, "available_qty" integer NOT NULL, "reserved_qty" integer NOT NULL DEFAULT '0', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_3d60e3010c09d1c983170ee804" CHECK ("reserved_qty" >= 0), CONSTRAINT "CHK_5060654050f3c5c382d81ec9aa" CHECK ("available_qty" >= 0), CONSTRAINT "PK_e1b4a2b9011bc3d2598256448c6" PRIMARY KEY ("sku"))`);
        await queryRunner.query(`CREATE TABLE "inventory"."reservations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "order_id" uuid NOT NULL, "sku" character varying(50) NOT NULL, "qty" integer NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'RESERVED', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_46cc1f815c3f9bef9680ab8ccf" CHECK ("status" IN ('RESERVED','COMMITTED','RELEASED')), CONSTRAINT "CHK_942fd9a72776ba491313a4d9c1" CHECK ("qty" > 0), CONSTRAINT "PK_da95cef71b617ac35dc5bcda243" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_reservations_order_id" ON "inventory"."reservations" ("order_id") `);
        await queryRunner.query(`CREATE INDEX "idx_reservations_sku" ON "inventory"."reservations" ("sku") `);
        await queryRunner.query(`ALTER TABLE "inventory"."reservations" ADD CONSTRAINT "FK_66bff24d09df1a27abf34d44866" FOREIGN KEY ("sku") REFERENCES "inventory"."stock"("sku") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "inventory"."reservations" DROP CONSTRAINT "FK_66bff24d09df1a27abf34d44866"`);
        await queryRunner.query(`DROP INDEX "inventory"."idx_reservations_sku"`);
        await queryRunner.query(`DROP INDEX "inventory"."idx_reservations_order_id"`);
        await queryRunner.query(`DROP TABLE "inventory"."reservations"`);
        await queryRunner.query(`DROP TABLE "inventory"."stock"`);
    }

}
