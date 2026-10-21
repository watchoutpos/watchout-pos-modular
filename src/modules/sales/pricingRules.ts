export interface PricingLineInput {
  productId: string;
  unitPriceMinor: number;
  quantity: number;
  currency: string;
  gstPercentage: number;
  taxInclusive: boolean;
  discountPercentage?: number;
}

export interface PricedLine {
  productId: string;
  currency: string;
  quantity: number;
  subtotalMinor: number;
  discountMinor: number;
  taxableMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface PricingResult {
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxableMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines: PricedLine[];
}

function assertSafeMoney(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

function roundRatio(amount: number, numerator: number, denominator: number): number {
  if (
    !Number.isSafeInteger(amount) ||
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    amount < 0 || numerator < 0 || denominator <= 0 ||
    (numerator !== 0 && amount > Number.MAX_SAFE_INTEGER / numerator)
  ) {
    throw new Error('Pricing calculation exceeds safe numeric limits.');
  }
  const result = Math.round((amount * numerator) / denominator);
  assertSafeMoney(result, 'Calculated amount');
  return result;
}

function safeAdd(a: number, b: number): number {
  const result = a + b;
  assertSafeMoney(result, 'Total');
  return result;
}

export function calculateLinePricing(input: PricingLineInput): PricedLine {
  if (!input.productId.trim()) throw new Error('Product ID is required.');
  assertSafeMoney(input.unitPriceMinor, 'Unit price');

  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
    throw new Error('Quantity must be a positive whole number.');
  }
  if (!/^[A-Z]{3}$/.test(input.currency)) {
    throw new Error('Currency must be a three-letter uppercase code.');
  }
  if (
    !Number.isFinite(input.gstPercentage) ||
    input.gstPercentage < 0 || input.gstPercentage > 100
  ) {
    throw new Error('GST percentage must be between 0 and 100.');
  }

  const discountPercentage = input.discountPercentage ?? 0;
  if (
    !Number.isFinite(discountPercentage) ||
    discountPercentage < 0 || discountPercentage > 100
  ) {
    throw new Error('Discount percentage must be between 0 and 100.');
  }

  if (input.unitPriceMinor !== 0 &&
      input.quantity > Number.MAX_SAFE_INTEGER / input.unitPriceMinor) {
    throw new Error('Line subtotal exceeds safe numeric limits.');
  }
  const subtotalMinor = input.unitPriceMinor * input.quantity;
  assertSafeMoney(subtotalMinor, 'Line subtotal');

  const discountBasisPoints = Math.round(discountPercentage * 100);
  const discountMinor = roundRatio(subtotalMinor, discountBasisPoints, 10000);
  const amountAfterDiscount = subtotalMinor - discountMinor;
  const gstBasisPoints = Math.round(input.gstPercentage * 100);

  let taxableMinor: number;
  let taxMinor: number;
  let totalMinor: number;

  if (input.taxInclusive) {
    // The discounted selling price is the gross amount; extract GST from it.
    taxMinor = roundRatio(
      amountAfterDiscount,
      gstBasisPoints,
      10000 + gstBasisPoints,
    );
    taxableMinor = amountAfterDiscount - taxMinor;
    totalMinor = amountAfterDiscount;
  } else {
    // The discounted selling price is taxable value; add GST to it.
    taxableMinor = amountAfterDiscount;
    taxMinor = roundRatio(taxableMinor, gstBasisPoints, 10000);
    totalMinor = safeAdd(taxableMinor, taxMinor);
  }

  return {
    productId: input.productId,
    currency: input.currency,
    quantity: input.quantity,
    subtotalMinor,
    discountMinor,
    taxableMinor,
    taxMinor,
    totalMinor,
  };
}

export function calculateSalePricing(lines: PricingLineInput[]): PricingResult {
  if (lines.length === 0) throw new Error('At least one sale line is required.');

  const currency = lines[0].currency;
  if (lines.some((line) => line.currency !== currency)) {
    throw new Error('A sale cannot contain mixed currencies.');
  }

  const pricedLines = lines.map(calculateLinePricing);
  const totals = pricedLines.reduce(
    (sum, line) => ({
      subtotalMinor: safeAdd(sum.subtotalMinor, line.subtotalMinor),
      discountMinor: safeAdd(sum.discountMinor, line.discountMinor),
      taxableMinor: safeAdd(sum.taxableMinor, line.taxableMinor),
      taxMinor: safeAdd(sum.taxMinor, line.taxMinor),
      totalMinor: safeAdd(sum.totalMinor, line.totalMinor),
    }),
    {
      subtotalMinor: 0,
      discountMinor: 0,
      taxableMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
    },
  );

  return { currency, ...totals, lines: pricedLines };
}
