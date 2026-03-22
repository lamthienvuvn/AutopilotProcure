export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function delay(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function titleFromRequest(productName: string, quantity: number) {
  return `Need ${quantity} ${productName}${
    quantity > 1 && !productName.toLowerCase().endsWith("s") ? "s" : ""
  }`;
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function sanitizeText(value: string | undefined | null) {
  return value?.trim() ?? "";
}
