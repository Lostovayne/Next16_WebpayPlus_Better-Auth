import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebpayTransaction } from "../domain/Transaction";

// ─── Hoisted Variables ────────────────────────────────────────────────────────

const { mockGateway, mockRepoStore } = vi.hoisted(() => {
  const commitTransactionMock = vi.fn();
  const getTransactionStatusMock = vi.fn();
  return {
    mockGateway: {
      createTransaction: vi.fn(),
      commitTransaction: (...args: any[]) => commitTransactionMock(...args),
      getTransactionStatus: (...args: any[]) => getTransactionStatusMock(...args),
      requestRefund: vi.fn(),
      // Expose mocks for configuration
      _commitTransactionMock: commitTransactionMock,
      _getTransactionStatusMock: getTransactionStatusMock,
    },
    mockRepoStore: new Map<string, WebpayTransaction>(),
  };
});

// ─── Mock Modules ─────────────────────────────────────────────────────────────

vi.mock("../infrastructure/PrismaTransactionRepository", () => ({
  transactionRepository: {
    save: async (tx: WebpayTransaction) => {
      mockRepoStore.set(tx.props.id, tx);
    },
    findByToken: async (token: string) => {
      for (const tx of mockRepoStore.values()) {
        if (tx.props.token === token) return tx;
      }
      return null;
    },
    findByBuyOrder: async (buyOrder: string) => {
      for (const tx of mockRepoStore.values()) {
        if (tx.props.buyOrder === buyOrder) return tx;
      }
      return null;
    },
    findStaleInitialized: async (olderThanMinutes: number) => {
      const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
      return Array.from(mockRepoStore.values()).filter(
        (tx) =>
          tx.props.status === "INITIALIZED" &&
          tx.props.createdAt < cutoff &&
          !tx.props.polledAt,
      );
    },
  },
}));

vi.mock("@/shared/env", () => ({
  env: {
    WEBPAY_COMMERCE_CODE: "597055555532",
    WEBPAY_API_SECRET: "test-secret",
    WEBPAY_ENVIRONMENT: "integration",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    CRON_SECRET: "test-cron-secret",
  },
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

// ─── Import Actions + DI helpers ──────────────────────────────────────────────

import {
  confirmTransactionAction,
  abortTransactionAction,
  __setGatewayForTesting,
  __resetGatewayForTesting,
} from "./transactionActions";
import { TransbankAlreadyProcessedError } from "../infrastructure/TransbankGateway";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seed(tx: WebpayTransaction) {
  mockRepoStore.set(tx.props.id, tx);
}

function clearRepo() {
  mockRepoStore.clear();
}

function mockCommitAuthorized(overrides?: Record<string, unknown>) {
  mockGateway._commitTransactionMock.mockResolvedValueOnce({
    vci: "TSO", amount: 5000, status: "AUTHORIZED", buy_order: "BO123",
    session_id: "session-1", accounting_date: "0101",
    transaction_date: "2026-01-01T00:00:00.000Z", authorization_code: "AUTH001",
    payment_type_code: "VD", response_code: 0, installments_number: 1,
    ...overrides,
  });
}

function mockCommitRejected(responseCode = -1) {
  mockGateway._commitTransactionMock.mockResolvedValueOnce({
    vci: "TSO", amount: 5000, status: "REJECTED", buy_order: "BO123",
    session_id: "session-1", accounting_date: "0101",
    transaction_date: "2026-01-01T00:00:00.000Z", authorization_code: "",
    payment_type_code: "VD", response_code: responseCode, installments_number: 1,
  });
}

function mockGetStatusAuthorized() {
  mockGateway._getTransactionStatusMock.mockResolvedValueOnce({
    vci: "TSO", amount: 5000, status: "AUTHORIZED", buy_order: "BO123",
    session_id: "session-1", accounting_date: "0101",
    transaction_date: "2026-01-01T00:00:00.000Z", authorization_code: "AUTH001",
    payment_type_code: "VD", response_code: 0, installments_number: 1,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  vi.clearAllMocks();
  clearRepo();
  // Inject mock gateway via DI before each test
  await __setGatewayForTesting(mockGateway as any);
});

afterEach(async () => {
  await __resetGatewayForTesting();
});

describe("confirmTransactionAction", () => {
  describe("Normal flow (commit succeeds)", () => {
    it("transitions INITIALIZED → AUTHORIZED on successful commit", async () => {
      const tx = WebpayTransaction.initialize("BO123", "session-1", 5000);
      tx.setToken("tok_test_123");
      seed(tx);

      mockCommitAuthorized();

      const result = await confirmTransactionAction("tok_test_123");

      expect(result.status).toBe("AUTHORIZED");
      expect(result.authCode).toBe("AUTH001");
    });

    it("transitions INITIALIZED → REJECTED when Transbank rejects", async () => {
      const tx = WebpayTransaction.initialize("BO123", "session-1", 5000);
      tx.setToken("tok_test_123");
      seed(tx);

      mockCommitRejected(-1);

      const result = await confirmTransactionAction("tok_test_123");

      expect(result.status).toBe("REJECTED");
      expect(result.responseCode).toBe(-1);
    });
  });

  describe("Idempotency (already terminal)", () => {
    it("returns current state without calling Transbank if already AUTHORIZED", async () => {
      const tx = WebpayTransaction.initialize("BO123", "session-1", 5000);
      tx.setToken("tok_test_123");
      tx.markAsAuthorized({
        authorizationCode: "AUTH001",
        paymentTypeCode: "VD",
        installmentsNumber: 1,
        installmentsAmount: 5000,
        responseCode: 0,
      });
      seed(tx);

      const result = await confirmTransactionAction("tok_test_123");

      expect(result.status).toBe("AUTHORIZED");
      expect(mockGateway._commitTransactionMock).not.toHaveBeenCalled();
    });

    it("returns current state without calling Transbank if already REJECTED", async () => {
      const tx = WebpayTransaction.initialize("BO123", "session-1", 5000);
      tx.setToken("tok_test_123");
      tx.markAsRejected(-1);
      seed(tx);

      const result = await confirmTransactionAction("tok_test_123");

      expect(result.status).toBe("REJECTED");
      expect(mockGateway._commitTransactionMock).not.toHaveBeenCalled();
    });
  });

  describe("422 handling (already processed)", () => {
    it("falls back to getTransactionStatus when commit returns 422", async () => {
      const tx = WebpayTransaction.initialize("BO123", "session-1", 5000);
      tx.setToken("tok_test_123");
      seed(tx);

      mockGateway._commitTransactionMock.mockRejectedValueOnce(
        new TransbankAlreadyProcessedError("tok_test_123"),
      );
      mockGetStatusAuthorized();

      const result = await confirmTransactionAction("tok_test_123");

      expect(result.status).toBe("AUTHORIZED");
      expect(mockGateway._getTransactionStatusMock).toHaveBeenCalledWith("tok_test_123");
    });
  });

  describe("Error handling", () => {
    it("throws when token not found", async () => {
      await expect(confirmTransactionAction("nonexistent")).rejects.toThrow(
        "Transacción no encontrada",
      );
    });

    it("marks as FAILED on network error", async () => {
      const tx = WebpayTransaction.initialize("BO123", "session-1", 5000);
      tx.setToken("tok_test_123");
      seed(tx);

      mockGateway._commitTransactionMock.mockRejectedValueOnce(new Error("Network error"));

      const result = await confirmTransactionAction("tok_test_123");

      expect(result.status).toBe("FAILED");
    });
  });
});

describe("abortTransactionAction", () => {
  it("marks transaction as ABORTED when found", async () => {
    const tx = WebpayTransaction.initialize("BO123", "session-1", 5000);
    seed(tx);

    await abortTransactionAction("tbk_token_123", "BO123");

    const updated = mockRepoStore.get(tx.props.id);
    expect(updated).toBeDefined();
    expect(updated!.props.status).toBe("ABORTED");
    expect(updated!.props.abortedReason).toContain("tbk_token_123");
  });

  it("does nothing when buyOrder not found (logs warning)", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await abortTransactionAction("tbk_token_123", "NONEXISTENT");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("NONEXISTENT"),
    );
    consoleSpy.mockRestore();
  });

  it("does nothing when transaction is already terminal", async () => {
    const tx = WebpayTransaction.initialize("BO123", "session-1", 5000);
    tx.markAsAuthorized({
      authorizationCode: "AUTH001",
      paymentTypeCode: "VD",
      installmentsNumber: 1,
      installmentsAmount: 5000,
      responseCode: 0,
    });
    seed(tx);

    await abortTransactionAction("tbk_token_123", "BO123");

    const updated = mockRepoStore.get(tx.props.id);
    expect(updated!.props.status).toBe("AUTHORIZED");
  });
});
