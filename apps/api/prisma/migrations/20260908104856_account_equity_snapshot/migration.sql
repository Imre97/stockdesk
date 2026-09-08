-- CreateTable
CREATE TABLE "AccountEquitySnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "cash" DECIMAL(20,2) NOT NULL,
    "positionsValue" DECIMAL(20,2) NOT NULL,
    "equity" DECIMAL(20,2) NOT NULL,

    CONSTRAINT "AccountEquitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountEquitySnapshot_accountId_at_key" ON "AccountEquitySnapshot"("accountId", "at");

-- AddForeignKey
ALTER TABLE "AccountEquitySnapshot" ADD CONSTRAINT "AccountEquitySnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
