CREATE TABLE "store_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "store_counters" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "store_counters_pkey" PRIMARY KEY ("key")
);

INSERT INTO "store_settings" ("key", "value")
SELECT document."name" || '.' || setting.key, setting.value::text
FROM "store_documents" AS document
CROSS JOIN LATERAL jsonb_each(document."data") AS setting(key, value)
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value";

INSERT INTO "store_counters" ("key", "value")
SELECT setting.key, CASE WHEN setting.value ~ '^[0-9]+$' THEN setting.value::integer ELSE 0 END
FROM "store_documents" AS document
CROSS JOIN LATERAL jsonb_each_text(document."data") AS setting(key, value)
WHERE document."name" = 'counters'
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value";

DELETE FROM "store_documents";
DROP TABLE "store_documents";
