/**
 * Estados posibles de una transacción Webpay Plus.
 *
 * INITIALIZED  → Se creó y se redirigió al banco. Esperando retorno.
 * AUTHORIZED   → Transbank aprobó el cobro. Estado final positivo.
 * REJECTED     → Transbank rechazó el cobro (fondos insuficientes, etc).
 * ABORTED      → El usuario canceló manualmente en la pasarela (TBK_TOKEN).
 * FAILED       → Error técnico de nuestro sistema (no del banco).
 * REVERSED     → Fue revertido/anulado via Refund API después de autorizado.
 */
export type TransactionStatus =
  | "INITIALIZED"
  | "AUTHORIZED"
  | "REJECTED"
  | "ABORTED"
  | "FAILED"
  | "REVERSED";

export interface WebpayTransactionProps {
  id: string;
  buyOrder: string;
  sessionId: string;
  amount: number;
  status: TransactionStatus;
  token?: string;
  authCode?: string;
  paymentTypeCode?: string;
  installmentsAmount?: number;
  installmentsNumber?: number;
  responseCode?: number;
  abortedReason?: string;
  polledAt?: Date;
  createdAt: Date;
}

/** Respuesta del commit/status de Transbank que el dominio necesita conocer. */
export interface WebpayCommitData {
  authorizationCode: string;
  paymentTypeCode: string;
  installmentsNumber: number;
  installmentsAmount: number;
  responseCode: number;
}

/**
 * Entidad de Dominio: Transacción Webpay.
 *
 * Máquina de estados explícita. Ninguna transición ilegal es posible.
 * La infraestructura (Prisma, HTTP) es un detalle de implementación ajeno a esta clase.
 */
export class WebpayTransaction {
  constructor(public readonly props: WebpayTransactionProps) {}

  // ─── Factory Method ───────────────────────────────────────────────────────

  public static initialize(buyOrder: string, sessionId: string, amount: number): WebpayTransaction {
    if (amount <= 0) {
      throw new Error("Monto de transacción inválido: debe ser mayor a cero.");
    }
    if (buyOrder.length > 26) {
      throw new Error("buy_order supera los 26 caracteres permitidos por Transbank.");
    }

    return new WebpayTransaction({
      id: crypto.randomUUID(),
      buyOrder,
      sessionId,
      amount,
      status: "INITIALIZED",
      createdAt: new Date(),
    });
  }

  // ─── Transiciones de Estado ───────────────────────────────────────────────

  public setToken(token: string): void {
    this.assertStatus("INITIALIZED", "setToken");
    this.props.token = token;
  }

  public markAsAuthorized(data: WebpayCommitData): void {
    this.assertStatus("INITIALIZED", "markAsAuthorized");
    this.props.status = "AUTHORIZED";
    this.props.authCode = data.authorizationCode;
    this.props.paymentTypeCode = data.paymentTypeCode;
    this.props.installmentsNumber = data.installmentsNumber;
    this.props.installmentsAmount = data.installmentsAmount;
    this.props.responseCode = data.responseCode;
  }

  public markAsRejected(responseCode?: number): void {
    this.assertStatus("INITIALIZED", "markAsRejected");
    this.props.status = "REJECTED";
    this.props.responseCode = responseCode;
  }

  public markAsAbortedByClient(reason: string): void {
    this.assertStatus("INITIALIZED", "markAsAbortedByClient");
    this.props.status = "ABORTED";
    this.props.abortedReason = reason.slice(0, 50);
  }

  public markAsFailed(): void {
    // CRÍTICO: Una transacción AUTHORIZED jamás se puede marcar como FAILED.
    // Si Transbank ya cobró, hacer un rollback de estado sería un desastre contable.
    if (this.props.status === "AUTHORIZED") {
      throw new Error(
        `[Domain] Violación de integridad: No se puede marcar FAILED una transacción ya AUTHORIZED (${this.props.id}). Usa requestRefund.`,
      );
    }
    this.props.status = "FAILED";
  }

  public markAsReversed(): void {
    if (this.props.status !== "AUTHORIZED") {
      throw new Error(
        `[Domain] Solo se puede revertir una transacción AUTHORIZED. Estado actual: ${this.props.status}`,
      );
    }
    this.props.status = "REVERSED";
  }

  /** El Worker llama a esto para registrar cuándo auditó esta transacción. */
  public markAsPolled(): void {
    this.props.polledAt = new Date();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  public get isTerminal(): boolean {
    return ["AUTHORIZED", "REJECTED", "ABORTED", "FAILED", "REVERSED"].includes(this.props.status);
  }

  private assertStatus(expected: TransactionStatus, operation: string): void {
    if (this.props.status !== expected) {
      throw new Error(
        `[Domain] Transición inválida: "${operation}" requiere estado "${expected}" pero el estado actual es "${this.props.status}" (id: ${this.props.id}).`,
      );
    }
  }
}
