/*
  Warnings:

  - Added the required column `originalSubtotal` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originalUnitPrice` to the `OrderItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "originalCurrency" "Currency" NOT NULL DEFAULT 'USD',
ADD COLUMN     "originalSubtotal" DECIMAL(12,2) NOT NULL;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "originalUnitPrice" DECIMAL(12,2) NOT NULL;

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "baseCurrency" "Currency" NOT NULL DEFAULT 'USD',
    "targetCurrency" "Currency" NOT NULL DEFAULT 'NGN',
    "rate" DECIMAL(18,6) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_baseCurrency_targetCurrency_key" ON "ExchangeRate"("baseCurrency", "targetCurrency");
