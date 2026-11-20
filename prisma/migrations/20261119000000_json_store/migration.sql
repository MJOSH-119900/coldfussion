CREATE TABLE "store_records" (
    "collection" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_records_pkey" PRIMARY KEY ("collection", "recordId")
);

CREATE INDEX "store_records_collection_idx" ON "store_records"("collection");

CREATE TABLE "store_documents" (
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_documents_pkey" PRIMARY KEY ("name")
);
