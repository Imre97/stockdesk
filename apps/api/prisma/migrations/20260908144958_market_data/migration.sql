-- CreateTable
CREATE TABLE "Symbol" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "assetType" TEXT NOT NULL DEFAULT 'us_equity',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "shortable" BOOLEAN NOT NULL DEFAULT true,
    "fractionable" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Symbol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SymbolProfile" (
    "symbolId" TEXT NOT NULL,
    "industry" TEXT,
    "marketCap" DECIMAL(20,2),
    "sharesOutstanding" DECIMAL(20,8),
    "peRatio" DECIMAL(20,8),
    "week52High" DECIMAL(20,8),
    "week52Low" DECIMAL(20,8),
    "beta" DECIMAL(20,8),
    "dividendYield" DECIMAL(20,8),
    "logoUrl" TEXT,
    "websiteUrl" TEXT,
    "ipoDate" TIMESTAMP(3),
    "profileFetchedAt" TIMESTAMP(3),
    "metricsFetchedAt" TIMESTAMP(3),

    CONSTRAINT "SymbolProfile_pkey" PRIMARY KEY ("symbolId")
);

-- CreateTable
CREATE TABLE "Candle" (
    "id" TEXT NOT NULL,
    "symbolId" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(20,8) NOT NULL,
    "high" DECIMAL(20,8) NOT NULL,
    "low" DECIMAL(20,8) NOT NULL,
    "close" DECIMAL(20,8) NOT NULL,
    "volume" DECIMAL(20,8) NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Candle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandleCoverage" (
    "id" TEXT NOT NULL,
    "symbolId" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandleCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Symbol_symbol_key" ON "Symbol"("symbol");

-- CreateIndex
CREATE INDEX "Symbol_name_idx" ON "Symbol"("name");

-- CreateIndex
CREATE INDEX "Candle_symbolId_timeframe_time_idx" ON "Candle"("symbolId", "timeframe", "time");

-- CreateIndex
CREATE UNIQUE INDEX "Candle_symbolId_timeframe_time_key" ON "Candle"("symbolId", "timeframe", "time");

-- CreateIndex
CREATE INDEX "CandleCoverage_symbolId_timeframe_from_idx" ON "CandleCoverage"("symbolId", "timeframe", "from");

-- AddForeignKey
ALTER TABLE "SymbolProfile" ADD CONSTRAINT "SymbolProfile_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candle" ADD CONSTRAINT "Candle_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandleCoverage" ADD CONSTRAINT "CandleCoverage_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE CASCADE ON UPDATE CASCADE;
