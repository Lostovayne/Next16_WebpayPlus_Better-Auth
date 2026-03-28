-- CreateTable
CREATE TABLE "webpay_transactions" (
    "id" TEXT NOT NULL,
    "buy_order" VARCHAR(26) NOT NULL,
    "session_id" VARCHAR(61) NOT NULL,
    "amount" DECIMAL(17,2) NOT NULL,
    "token" VARCHAR(64),
    "status" VARCHAR(20) NOT NULL DEFAULT 'INITIALIZED',
    "vci" VARCHAR(10),
    "card_number" VARCHAR(19),
    "accounting_date" VARCHAR(4),
    "transaction_date" TIMESTAMP(3),
    "auth_code" VARCHAR(6),
    "payment_type_code" VARCHAR(2),
    "response_code" INTEGER,
    "installments_amount" DECIMAL(17,2),
    "installments_number" INTEGER,
    "aborted_reason" VARCHAR(50),
    "polled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webpay_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webpay_transactions_buy_order_key" ON "webpay_transactions"("buy_order");

-- CreateIndex
CREATE UNIQUE INDEX "webpay_transactions_token_key" ON "webpay_transactions"("token");
