export type MockDiffLine = {
  type: 'added' | 'removed' | 'context';
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
};

export type MockDiffHunk = {
  header: string;
  lines: MockDiffLine[];
};

export type MockDiffFile = {
  filePath: string;
  status: 'added' | 'modified' | 'deleted';
  hunks: MockDiffHunk[];
  additions: number;
  deletions: number;
};

export type MockBranchDiff = {
  files: MockDiffFile[];
  totalAdditions: number;
  totalDeletions: number;
};

export type FullFileView = {
  lines: MockDiffLine[];
  hunkStartIndices: number[];
};

/**
 * Full "new version" content for each modified file.
 * Lines covered by hunks are placeholders (replaced by hunk data in the builder).
 */
const FILE_NEW_CONTENTS: Record<string, string[]> = {
  'src/trading/order-matching.ts': [
    /* 1  */ 'import { Order } from "./types";',
    /* 2  */ 'import { OrderBook, type MatchResult, MatcherOptions } from "./types";',
    /* 3  */ 'import { Logger } from "../utils/logger";',
    /* 4  */ 'import { validateOrder } from "./utils/validation";',
    /* 5  */ '',
    /* 6  */ 'const logger = new Logger("order-matcher");',
    /* 7  */ '',
    /* 8  */ 'type OrderSide = "buy" | "sell";',
    /* 9  */ '',
    /* 10 */ 'const DEFAULT_TIMEOUT = 30_000;',
    /* 11 */ '',
    // 12–24: hunk 1 (placeholders)
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    /* 25 */ '    const sortedCandidates = candidates.sort((a, b) => a.price - b.price);',
    /* 26 */ '    if (sortedCandidates.length === 0) {',
    /* 27 */ '      return { filled: [], avgPrice: 0, slippage: 0, rejected: false };',
    /* 28 */ '    }',
    /* 29 */ '',
    /* 30 */ '    const validCandidates = sortedCandidates.filter(',
    /* 31 */ '      (c) => this.validateSlippage(c.price, order.limitPrice)',
    /* 32 */ '    );',
    /* 33 */ '',
    /* 34 */ '    logger.debug(`Found ${validCandidates.length} valid candidates`);',
    /* 35 */ '',
    /* 36 */ '    let remainingQty = order.quantity;',
    /* 37 */ '    const matchedOrders: Order[] = [];',
    /* 38 */ '',
    /* 39 */ '    for (const candidate of validCandidates) {',
    /* 40 */ '      if (remainingQty <= 0) break;',
    /* 41 */ '      matchedOrders.push(candidate);',
    /* 42 */ '      remainingQty -= candidate.quantity;',
    /* 43 */ '    }',
    /* 44 */ '',
    /* 45 */ '    if (!this.enablePartialFills && remainingQty > 0) {',
    /* 46 */ '      return { filled: [], avgPrice: 0, slippage: 0, rejected: false };',
    /* 47 */ '    }',
    /* 48 */ '',
    /* 49 */ '    const fillIndex = matchedOrders.length;',
    /* 50 */ '    const filled = candidates.slice(0, fillIndex);',
    // 51–62: hunk 2 (placeholders)
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    /* 63 */ '',
    /* 64 */ 'export default OrderMatcher;',
    /* 65 */ '',
  ],
  'src/trading/types.ts': [
    /* 1  */ 'export type OrderSide = "buy" | "sell";',
    /* 2  */ '',
    /* 3  */ 'export type Order = {',
    /* 4  */ '  id: string;',
    /* 5  */ '  side: OrderSide;',
    /* 6  */ '  quantity: number;',
    /* 7  */ '  limitPrice: number;',
    /* 8  */ '  marketId: string;',
    /* 9  */ '  createdAt: string;',
    /* 10 */ '};',
    /* 11 */ '',
    /* 12 */ 'export type OrderBook = {',
    /* 13 */ '  getOpposite(side: OrderSide): Order[];',
    /* 14 */ '  getBySide(side: OrderSide): Order[];',
    /* 15 */ '  getAll(): Order[];',
    /* 16 */ '  remove(orderId: string): boolean;',
    /* 17 */ '  add(order: Order): void;',
    /* 18 */ '};',
    /* 19 */ '',
    /* 20 */ 'export type MarketConfig = {',
    /* 21 */ '  id: string;',
    /* 22 */ '  name: string;',
    /* 23 */ '  minOrderSize: number;',
    /* 24 */ '  maxSlippage: number;',
    /* 25 */ '};',
    /* 26 */ '',
    /* 27 */ 'export type MatchResult = {',
    // 28–37: hunk (placeholders)
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    /* 38 */ '',
    /* 39 */ 'export default {};',
    /* 40 */ '',
  ],
  'src/config/markets.json': [
    /* 1  */ '{',
    /* 2  */ '  "version": 2,',
    /* 3  */ '  "markets": [',
    /* 4  */ '',
    // 5–13: hunk (placeholders)
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    /* 14 */ '    }',
    /* 15 */ '  ]',
    /* 16 */ '}',
  ],
  'src/api/routes/orders.ts': [
    /* 1  */ 'import { Router } from "express";',
    /* 2  */ 'import { OrderMatcher } from "../trading/order-matching";',
    /* 3  */ 'import { parseOrder } from "../trading/utils/validation";',
    /* 4  */ 'import { getOrderBook } from "../services/order-book";',
    /* 5  */ '',
    /* 6  */ 'const router = Router();',
    /* 7  */ 'const orderBook = getOrderBook();',
    /* 8  */ '',
    /* 9  */ 'router.get("/", (req, res) => {',
    /* 10 */ '  const orders = orderBook.getAll();',
    /* 11 */ '  res.json(orders);',
    /* 12 */ '});',
    /* 13 */ '',
    /* 14 */ 'router.get("/:id", (req, res) => {',
    /* 15 */ '  res.json({ id: req.params.id });',
    /* 16 */ '});',
    /* 17 */ '',
    // 18–31: hunk (placeholders)
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    /* 32 */ '',
    /* 33 */ 'export default router;',
    /* 34 */ '',
  ],
  'tests/trading/order-matching.test.ts': [
    /* 1  */ 'import { describe, it, expect, beforeEach } from "vitest";',
    /* 2  */ 'import { OrderMatcher } from "../../src/trading/order-matching";',
    /* 3  */ 'import { createMockOrderBook, createOrder } from "../helpers";',
    /* 4  */ '',
    /* 5  */ 'describe("OrderMatcher", () => {',
    /* 6  */ '  let orderBook: ReturnType<typeof createMockOrderBook>;',
    /* 7  */ '  let matcher: OrderMatcher;',
    /* 8  */ '  let unmatchableOrder: ReturnType<typeof createOrder>;',
    /* 9  */ '',
    /* 10 */ '  beforeEach(() => {',
    /* 11 */ '    orderBook = createMockOrderBook([',
    /* 12 */ '      createOrder({ side: "sell", price: 50, quantity: 10 }),',
    /* 13 */ '      createOrder({ side: "sell", price: 51, quantity: 20 }),',
    /* 14 */ '    ]);',
    /* 15 */ '    matcher = new OrderMatcher(orderBook);',
    /* 16 */ '    unmatchableOrder = createOrder({ side: "buy", limitPrice: 1 });',
    /* 17 */ '  });',
    /* 18 */ '',
    /* 19 */ '  it("should match a simple buy order", () => {',
    /* 20 */ '    const order = createOrder({ side: "buy", limitPrice: 55, quantity: 10 });',
    /* 21 */ '    const result = matcher.match(order);',
    /* 22 */ '    expect(result.filled).toHaveLength(1);',
    /* 23 */ '    expect(result.rejected).toBe(false);',
    /* 24 */ '  });',
    /* 25 */ '',
    /* 26 */ '  it("should match multiple orders for large quantity", () => {',
    /* 27 */ '    const order = createOrder({ side: "buy", limitPrice: 55, quantity: 25 });',
    /* 28 */ '    const result = matcher.match(order);',
    /* 29 */ '    expect(result.filled).toHaveLength(2);',
    /* 30 */ '  });',
    /* 31 */ '',
    /* 32 */ '  it("should calculate average fill price", () => {',
    /* 33 */ '    const order = createOrder({ side: "buy", limitPrice: 55, quantity: 25 });',
    /* 34 */ '    const result = matcher.match(order);',
    /* 35 */ '    expect(result.filled).toHaveLength(2);',
    /* 36 */ '    const expectedAvg = (50 + 51) / 2;',
    /* 37 */ '    expect(result.avgPrice).toBeCloseTo(expectedAvg);',
    /* 38 */ '  });',
    /* 39 */ '',
    /* 40 */ '  it("should calculate average price correctly", () => {',
    /* 41 */ '    const result = matcher.match(createOrder({ limitPrice: 55, quantity: 25 }));',
    // 42–59: hunk (placeholders)
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    /* 60 */ '});',
    /* 61 */ '',
  ],
};

function buildHunkMaps(hunks: MockDiffHunk[]) {
  const startByNewLine = new Map<number, number>();
  const endNewLine = new Map<number, number>();

  for (let i = 0; i < hunks.length; i++) {
    const hunk = hunks[i]!;
    const firstNew = hunk.lines.find((l) => l.newLineNumber !== null)?.newLineNumber;
    const lastNew = [...hunk.lines].reverse().find((l) => l.newLineNumber !== null)?.newLineNumber;
    if (firstNew !== null && firstNew !== undefined) startByNewLine.set(firstNew, i);
    if (lastNew !== null && lastNew !== undefined) endNewLine.set(i, lastNew);
  }

  return { startByNewLine, endNewLine };
}

function flattenHunks(hunks: MockDiffHunk[]): FullFileView {
  const lines = hunks.flatMap((h) => h.lines);
  let offset = 0;
  const hunkStartIndices = hunks.map((h) => {
    const idx = offset;
    offset += h.lines.length;
    return idx;
  });
  return { lines, hunkStartIndices };
}

/** Build a full-file view by filling gaps between hunks with file content. */
export function buildFullFileView(file: MockDiffFile): FullFileView {
  // For added/deleted files, the entire file IS the diff
  if (file.status === 'added' || file.status === 'deleted') {
    return { lines: file.hunks.flatMap((h) => h.lines), hunkStartIndices: [0] };
  }

  const newContent = FILE_NEW_CONTENTS[file.filePath];
  if (!newContent) return flattenHunks(file.hunks);

  const { startByNewLine, endNewLine } = buildHunkMaps(file.hunks);
  const result: MockDiffLine[] = [];
  const hunkStartIndices: number[] = [];
  let currentNewLine = 1;
  let currentOldLine = 1;

  while (currentNewLine <= newContent.length) {
    const hunkIdx = startByNewLine.get(currentNewLine);

    if (hunkIdx !== undefined) {
      const hunk = file.hunks[hunkIdx]!;
      hunkStartIndices.push(result.length);
      result.push(...hunk.lines);

      const lastNew = endNewLine.get(hunkIdx);
      const lastOld = [...hunk.lines]
        .reverse()
        .find((l) => l.oldLineNumber !== null)?.oldLineNumber;

      if (lastNew !== null && lastNew !== undefined) currentNewLine = lastNew + 1;
      if (lastOld !== null && lastOld !== undefined) currentOldLine = lastOld + 1;
    } else {
      result.push({
        type: 'context',
        content: newContent[currentNewLine - 1] ?? '',
        oldLineNumber: currentOldLine,
        newLineNumber: currentNewLine,
      });
      currentNewLine++;
      currentOldLine++;
    }
  }

  return { lines: result, hunkStartIndices };
}

export function getMockThreadDiff(): MockBranchDiff {
  const files: MockDiffFile[] = [
    {
      filePath: 'src/trading/order-matching.ts',
      status: 'modified',
      additions: 4,
      deletions: 2,
      hunks: [
        {
          header: '@@ -45,9 +51,13 @@ export class OrderMatcher {',
          lines: [
            {
              type: 'context',
              content: '    const filled = candidates.slice(0, fillIndex);',
              oldLineNumber: 45,
              newLineNumber: 51,
            },
            {
              type: 'context',
              content: '    const totalPrice = filled.reduce((sum, c) => sum + c.price, 0);',
              oldLineNumber: 46,
              newLineNumber: 52,
            },
            {
              type: 'removed',
              content: '    const avgPrice = totalPrice / filled.length;',
              oldLineNumber: 47,
              newLineNumber: null,
            },
            {
              type: 'removed',
              content: '    return { filled, avgPrice, slippage: 0 };',
              oldLineNumber: 48,
              newLineNumber: null,
            },
            {
              type: 'added',
              content: '    const avgPrice = filled.length > 0 ? totalPrice / filled.length : 0;',
              oldLineNumber: null,
              newLineNumber: 53,
            },
            {
              type: 'added',
              content:
                '    const slippage = Math.abs(avgPrice - order.limitPrice) / order.limitPrice;',
              oldLineNumber: null,
              newLineNumber: 54,
            },
            {
              type: 'added',
              content: '    return { filled, avgPrice, slippage, rejected: false };',
              oldLineNumber: null,
              newLineNumber: 55,
            },
            { type: 'added', content: '  }', oldLineNumber: null, newLineNumber: 56 },
            { type: 'context', content: '}', oldLineNumber: 49, newLineNumber: 57 },
          ],
        },
      ],
    },
    {
      filePath: 'src/trading/utils/validation.ts',
      status: 'added',
      additions: 16,
      deletions: 0,
      hunks: [
        {
          header: '@@ -0,0 +1,16 @@',
          lines: [
            {
              type: 'added',
              content: 'import { z } from "zod";',
              oldLineNumber: null,
              newLineNumber: 1,
            },
            { type: 'added', content: '', oldLineNumber: null, newLineNumber: 2 },
            {
              type: 'added',
              content: 'export const OrderSchema = z.object({',
              oldLineNumber: null,
              newLineNumber: 3,
            },
            {
              type: 'added',
              content: '  id: z.string().uuid(),',
              oldLineNumber: null,
              newLineNumber: 4,
            },
            {
              type: 'added',
              content: '  side: z.enum(["buy", "sell"]),',
              oldLineNumber: null,
              newLineNumber: 5,
            },
            {
              type: 'added',
              content: '  quantity: z.number().positive(),',
              oldLineNumber: null,
              newLineNumber: 6,
            },
            {
              type: 'added',
              content: '  limitPrice: z.number().nonnegative(),',
              oldLineNumber: null,
              newLineNumber: 7,
            },
            {
              type: 'added',
              content: '  marketId: z.string(),',
              oldLineNumber: null,
              newLineNumber: 8,
            },
            {
              type: 'added',
              content: '  createdAt: z.string().datetime(),',
              oldLineNumber: null,
              newLineNumber: 9,
            },
            { type: 'added', content: '});', oldLineNumber: null, newLineNumber: 10 },
            { type: 'added', content: '', oldLineNumber: null, newLineNumber: 11 },
            {
              type: 'added',
              content: 'export type ValidatedOrder = z.infer<typeof OrderSchema>;',
              oldLineNumber: null,
              newLineNumber: 12,
            },
            { type: 'added', content: '', oldLineNumber: null, newLineNumber: 13 },
            {
              type: 'added',
              content: 'export function validateOrder(data: unknown): ValidatedOrder {',
              oldLineNumber: null,
              newLineNumber: 14,
            },
            {
              type: 'added',
              content: '  return OrderSchema.parse(data);',
              oldLineNumber: null,
              newLineNumber: 15,
            },
            { type: 'added', content: '}', oldLineNumber: null, newLineNumber: 16 },
          ],
        },
      ],
    },
  ];

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  return { files, totalAdditions, totalDeletions };
}

export function getMockBranchDiff(): MockBranchDiff {
  const files: MockDiffFile[] = [
    {
      filePath: 'src/trading/order-matching.ts',
      status: 'modified',
      additions: 18,
      deletions: 8,
      hunks: [
        {
          header: '@@ -12,14 +12,20 @@ import { OrderBook, type MatchResult } from "./types";',
          lines: [
            {
              type: 'context',
              content: 'export class OrderMatcher {',
              oldLineNumber: 12,
              newLineNumber: 12,
            },
            {
              type: 'context',
              content: '  private orderBook: OrderBook;',
              oldLineNumber: 13,
              newLineNumber: 13,
            },
            {
              type: 'removed',
              content: '  private readonly maxSlippage = 0.05;',
              oldLineNumber: 14,
              newLineNumber: null,
            },
            {
              type: 'added',
              content: '  private readonly maxSlippage: number;',
              oldLineNumber: null,
              newLineNumber: 14,
            },
            {
              type: 'added',
              content: '  private readonly enablePartialFills: boolean;',
              oldLineNumber: null,
              newLineNumber: 15,
            },
            { type: 'context', content: '', oldLineNumber: 15, newLineNumber: 16 },
            {
              type: 'removed',
              content: '  constructor(orderBook: OrderBook) {',
              oldLineNumber: 16,
              newLineNumber: null,
            },
            {
              type: 'added',
              content: '  constructor(orderBook: OrderBook, options?: MatcherOptions) {',
              oldLineNumber: null,
              newLineNumber: 17,
            },
            {
              type: 'context',
              content: '    this.orderBook = orderBook;',
              oldLineNumber: 17,
              newLineNumber: 18,
            },
            { type: 'removed', content: '  }', oldLineNumber: 18, newLineNumber: null },
            {
              type: 'added',
              content: '    this.maxSlippage = options?.maxSlippage ?? 0.05;',
              oldLineNumber: null,
              newLineNumber: 19,
            },
            {
              type: 'added',
              content: '    this.enablePartialFills = options?.enablePartialFills ?? false;',
              oldLineNumber: null,
              newLineNumber: 20,
            },
            { type: 'added', content: '  }', oldLineNumber: null, newLineNumber: 21 },
            { type: 'context', content: '', oldLineNumber: 19, newLineNumber: 22 },
            {
              type: 'context',
              content: '  match(order: Order): MatchResult {',
              oldLineNumber: 20,
              newLineNumber: 23,
            },
            {
              type: 'context',
              content: '    const candidates = this.orderBook.getOpposite(order.side);',
              oldLineNumber: 21,
              newLineNumber: 24,
            },
          ],
        },
        {
          header: '@@ -45,9 +51,13 @@ export class OrderMatcher {',
          lines: [
            {
              type: 'context',
              content: '    const filled = candidates.slice(0, fillIndex);',
              oldLineNumber: 45,
              newLineNumber: 51,
            },
            {
              type: 'context',
              content: '    const totalPrice = filled.reduce((sum, c) => sum + c.price, 0);',
              oldLineNumber: 46,
              newLineNumber: 52,
            },
            {
              type: 'removed',
              content: '    const avgPrice = totalPrice / filled.length;',
              oldLineNumber: 47,
              newLineNumber: null,
            },
            {
              type: 'removed',
              content: '    return { filled, avgPrice, slippage: 0 };',
              oldLineNumber: 48,
              newLineNumber: null,
            },
            {
              type: 'added',
              content: '    const avgPrice = filled.length > 0 ? totalPrice / filled.length : 0;',
              oldLineNumber: null,
              newLineNumber: 53,
            },
            {
              type: 'added',
              content:
                '    const slippage = Math.abs(avgPrice - order.limitPrice) / order.limitPrice;',
              oldLineNumber: null,
              newLineNumber: 54,
            },
            { type: 'added', content: '', oldLineNumber: null, newLineNumber: 55 },
            {
              type: 'added',
              content: '    if (slippage > this.maxSlippage) {',
              oldLineNumber: null,
              newLineNumber: 56,
            },
            {
              type: 'added',
              content: '      return { filled: [], avgPrice: 0, slippage, rejected: true };',
              oldLineNumber: null,
              newLineNumber: 57,
            },
            { type: 'added', content: '    }', oldLineNumber: null, newLineNumber: 58 },
            { type: 'added', content: '', oldLineNumber: null, newLineNumber: 59 },
            {
              type: 'added',
              content: '    return { filled, avgPrice, slippage, rejected: false };',
              oldLineNumber: null,
              newLineNumber: 60,
            },
            { type: 'context', content: '  }', oldLineNumber: 49, newLineNumber: 61 },
            { type: 'context', content: '}', oldLineNumber: 50, newLineNumber: 62 },
          ],
        },
      ],
    },
    {
      filePath: 'src/trading/types.ts',
      status: 'modified',
      additions: 7,
      deletions: 1,
      hunks: [
        {
          header: '@@ -28,4 +28,10 @@ export type MatchResult = {',
          lines: [
            {
              type: 'context',
              content: '  filled: Order[];',
              oldLineNumber: 28,
              newLineNumber: 28,
            },
            {
              type: 'context',
              content: '  avgPrice: number;',
              oldLineNumber: 29,
              newLineNumber: 29,
            },
            {
              type: 'removed',
              content: '  slippage: number;',
              oldLineNumber: 30,
              newLineNumber: null,
            },
            {
              type: 'added',
              content: '  slippage: number;',
              oldLineNumber: null,
              newLineNumber: 30,
            },
            {
              type: 'added',
              content: '  rejected: boolean;',
              oldLineNumber: null,
              newLineNumber: 31,
            },
            { type: 'added', content: '};', oldLineNumber: null, newLineNumber: 32 },
            { type: 'added', content: '', oldLineNumber: null, newLineNumber: 33 },
            {
              type: 'added',
              content: 'export type MatcherOptions = {',
              oldLineNumber: null,
              newLineNumber: 34,
            },
            {
              type: 'added',
              content: '  maxSlippage?: number;',
              oldLineNumber: null,
              newLineNumber: 35,
            },
            {
              type: 'added',
              content: '  enablePartialFills?: boolean;',
              oldLineNumber: null,
              newLineNumber: 36,
            },
            { type: 'context', content: '};', oldLineNumber: 31, newLineNumber: 37 },
          ],
        },
      ],
    },
    {
      filePath: 'src/trading/utils/validation.ts',
      status: 'added',
      additions: 22,
      deletions: 0,
      hunks: [
        {
          header: '@@ -0,0 +1,22 @@',
          lines: [
            {
              type: 'added',
              content: 'import { z } from "zod";',
              oldLineNumber: null,
              newLineNumber: 1,
            },
            { type: 'added', content: '', oldLineNumber: null, newLineNumber: 2 },
            {
              type: 'added',
              content: 'export const OrderSchema = z.object({',
              oldLineNumber: null,
              newLineNumber: 3,
            },
            {
              type: 'added',
              content: '  id: z.string().uuid(),',
              oldLineNumber: null,
              newLineNumber: 4,
            },
            {
              type: 'added',
              content: '  side: z.enum(["buy", "sell"]),',
              oldLineNumber: null,
              newLineNumber: 5,
            },
            {
              type: 'added',
              content: '  quantity: z.number().positive(),',
              oldLineNumber: null,
              newLineNumber: 6,
            },
            {
              type: 'added',
              content: '  limitPrice: z.number().nonnegative(),',
              oldLineNumber: null,
              newLineNumber: 7,
            },
            {
              type: 'added',
              content: '  marketId: z.string(),',
              oldLineNumber: null,
              newLineNumber: 8,
            },
            {
              type: 'added',
              content: '  createdAt: z.string().datetime(),',
              oldLineNumber: null,
              newLineNumber: 9,
            },
            { type: 'added', content: '});', oldLineNumber: null, newLineNumber: 10 },
            { type: 'added', content: '', oldLineNumber: null, newLineNumber: 11 },
            {
              type: 'added',
              content: 'export type ValidatedOrder = z.infer<typeof OrderSchema>;',
              oldLineNumber: null,
              newLineNumber: 12,
            },
            { type: 'added', content: '', oldLineNumber: null, newLineNumber: 13 },
            {
              type: 'added',
              content: 'export function validateOrder(data: unknown): ValidatedOrder {',
              oldLineNumber: null,
              newLineNumber: 14,
            },
            {
              type: 'added',
              content: '  return OrderSchema.parse(data);',
              oldLineNumber: null,
              newLineNumber: 15,
            },
            { type: 'added', content: '}', oldLineNumber: null, newLineNumber: 16 },
            { type: 'added', content: '', oldLineNumber: null, newLineNumber: 17 },
            {
              type: 'added',
              content: 'export function isValidOrderSide(side: string): side is "buy" | "sell" {',
              oldLineNumber: null,
              newLineNumber: 18,
            },
            {
              type: 'added',
              content: '  return side === "buy" || side === "sell";',
              oldLineNumber: null,
              newLineNumber: 19,
            },
            { type: 'added', content: '}', oldLineNumber: null, newLineNumber: 20 },
            { type: 'added', content: '', oldLineNumber: null, newLineNumber: 21 },
            {
              type: 'added',
              content: 'export const MAX_ORDER_QUANTITY = 1_000_000;',
              oldLineNumber: null,
              newLineNumber: 22,
            },
          ],
        },
      ],
    },
    {
      filePath: 'src/config/markets.json',
      status: 'modified',
      additions: 4,
      deletions: 2,
      hunks: [
        {
          header: '@@ -5,8 +5,10 @@',
          lines: [
            { type: 'context', content: '    {', oldLineNumber: 5, newLineNumber: 5 },
            {
              type: 'context',
              content: '      "id": "us-election-2024",',
              oldLineNumber: 6,
              newLineNumber: 6,
            },
            {
              type: 'context',
              content: '      "name": "US Presidential Election",',
              oldLineNumber: 7,
              newLineNumber: 7,
            },
            {
              type: 'removed',
              content: '      "category": "politics",',
              oldLineNumber: 8,
              newLineNumber: null,
            },
            {
              type: 'removed',
              content: '      "active": true',
              oldLineNumber: 9,
              newLineNumber: null,
            },
            {
              type: 'added',
              content: '      "category": "politics",',
              oldLineNumber: null,
              newLineNumber: 8,
            },
            {
              type: 'added',
              content: '      "active": true,',
              oldLineNumber: null,
              newLineNumber: 9,
            },
            {
              type: 'added',
              content: '      "minOrderSize": 10,',
              oldLineNumber: null,
              newLineNumber: 10,
            },
            {
              type: 'added',
              content: '      "maxSlippage": 0.03',
              oldLineNumber: null,
              newLineNumber: 11,
            },
            { type: 'context', content: '    },', oldLineNumber: 10, newLineNumber: 12 },
            { type: 'context', content: '    {', oldLineNumber: 11, newLineNumber: 13 },
          ],
        },
      ],
    },
    {
      filePath: 'src/api/routes/orders.ts',
      status: 'modified',
      additions: 9,
      deletions: 3,
      hunks: [
        {
          header: '@@ -18,9 +18,15 @@ router.post("/", async (req, res) => {',
          lines: [
            {
              type: 'context',
              content: '  const order = parseOrder(req.body);',
              oldLineNumber: 18,
              newLineNumber: 18,
            },
            {
              type: 'context',
              content: '  const matcher = new OrderMatcher(orderBook);',
              oldLineNumber: 19,
              newLineNumber: 19,
            },
            {
              type: 'removed',
              content: '  const result = matcher.match(order);',
              oldLineNumber: 20,
              newLineNumber: null,
            },
            {
              type: 'removed',
              content: '  if (result.filled.length === 0) {',
              oldLineNumber: 21,
              newLineNumber: null,
            },
            {
              type: 'removed',
              content: '    return res.status(400).json({ error: "No match found" });',
              oldLineNumber: 22,
              newLineNumber: null,
            },
            {
              type: 'added',
              content: '  const result = matcher.match(order);',
              oldLineNumber: null,
              newLineNumber: 20,
            },
            { type: 'added', content: '', oldLineNumber: null, newLineNumber: 21 },
            {
              type: 'added',
              content: '  if (result.rejected) {',
              oldLineNumber: null,
              newLineNumber: 22,
            },
            {
              type: 'added',
              content: '    return res.status(400).json({',
              oldLineNumber: null,
              newLineNumber: 23,
            },
            {
              type: 'added',
              content: '      error: "Order rejected: slippage exceeded",',
              oldLineNumber: null,
              newLineNumber: 24,
            },
            {
              type: 'added',
              content: '      slippage: result.slippage,',
              oldLineNumber: null,
              newLineNumber: 25,
            },
            { type: 'added', content: '    });', oldLineNumber: null, newLineNumber: 26 },
            { type: 'added', content: '  }', oldLineNumber: null, newLineNumber: 27 },
            { type: 'added', content: '', oldLineNumber: null, newLineNumber: 28 },
            {
              type: 'added',
              content: '  if (result.filled.length === 0) {',
              oldLineNumber: null,
              newLineNumber: 29,
            },
            { type: 'context', content: '  }', oldLineNumber: 23, newLineNumber: 30 },
            { type: 'context', content: '', oldLineNumber: 24, newLineNumber: 31 },
          ],
        },
      ],
    },
    {
      filePath: 'tests/trading/order-matching.test.ts',
      status: 'modified',
      additions: 14,
      deletions: 2,
      hunks: [
        {
          header: '@@ -42,8 +42,20 @@ describe("OrderMatcher", () => {',
          lines: [
            {
              type: 'context',
              content: '    expect(result.avgPrice).toBeCloseTo(50.5);',
              oldLineNumber: 42,
              newLineNumber: 42,
            },
            { type: 'context', content: '  });', oldLineNumber: 43, newLineNumber: 43 },
            { type: 'context', content: '', oldLineNumber: 44, newLineNumber: 44 },
            {
              type: 'removed',
              content: '  it("should return empty when no matches", () => {',
              oldLineNumber: 45,
              newLineNumber: null,
            },
            {
              type: 'removed',
              content: '    const result = matcher.match(unmatchableOrder);',
              oldLineNumber: 46,
              newLineNumber: null,
            },
            {
              type: 'added',
              content: '  it("should reject when slippage exceeds max", () => {',
              oldLineNumber: null,
              newLineNumber: 45,
            },
            {
              type: 'added',
              content: '    const matcher = new OrderMatcher(orderBook, { maxSlippage: 0.01 });',
              oldLineNumber: null,
              newLineNumber: 46,
            },
            {
              type: 'added',
              content: '    const order = createOrder({ limitPrice: 50, quantity: 100 });',
              oldLineNumber: null,
              newLineNumber: 47,
            },
            {
              type: 'added',
              content: '    const result = matcher.match(order);',
              oldLineNumber: null,
              newLineNumber: 48,
            },
            {
              type: 'added',
              content: '    expect(result.rejected).toBe(true);',
              oldLineNumber: null,
              newLineNumber: 49,
            },
            {
              type: 'added',
              content: '    expect(result.slippage).toBeGreaterThan(0.01);',
              oldLineNumber: null,
              newLineNumber: 50,
            },
            { type: 'added', content: '  });', oldLineNumber: null, newLineNumber: 51 },
            { type: 'added', content: '', oldLineNumber: null, newLineNumber: 52 },
            {
              type: 'added',
              content: '  it("should return empty when no matches", () => {',
              oldLineNumber: null,
              newLineNumber: 53,
            },
            {
              type: 'added',
              content: '    const result = matcher.match(unmatchableOrder);',
              oldLineNumber: null,
              newLineNumber: 54,
            },
            {
              type: 'added',
              content: '    expect(result.filled).toHaveLength(0);',
              oldLineNumber: null,
              newLineNumber: 55,
            },
            {
              type: 'added',
              content: '    expect(result.rejected).toBe(false);',
              oldLineNumber: null,
              newLineNumber: 56,
            },
            {
              type: 'context',
              content: '    expect(result.filled).toHaveLength(0);',
              oldLineNumber: 47,
              newLineNumber: 57,
            },
            { type: 'context', content: '  });', oldLineNumber: 48, newLineNumber: 58 },
            { type: 'context', content: '});', oldLineNumber: 49, newLineNumber: 59 },
          ],
        },
      ],
    },
    {
      filePath: 'README.md',
      status: 'deleted',
      additions: 0,
      deletions: 15,
      hunks: [
        {
          header: '@@ -1,15 +0,0 @@',
          lines: [
            { type: 'removed', content: '# Trading Engine', oldLineNumber: 1, newLineNumber: null },
            { type: 'removed', content: '', oldLineNumber: 2, newLineNumber: null },
            {
              type: 'removed',
              content: 'A high-performance order matching engine.',
              oldLineNumber: 3,
              newLineNumber: null,
            },
            { type: 'removed', content: '', oldLineNumber: 4, newLineNumber: null },
            {
              type: 'removed',
              content: '## Getting Started',
              oldLineNumber: 5,
              newLineNumber: null,
            },
            { type: 'removed', content: '', oldLineNumber: 6, newLineNumber: null },
            { type: 'removed', content: '```bash', oldLineNumber: 7, newLineNumber: null },
            { type: 'removed', content: 'pnpm install', oldLineNumber: 8, newLineNumber: null },
            { type: 'removed', content: 'pnpm dev', oldLineNumber: 9, newLineNumber: null },
            { type: 'removed', content: '```', oldLineNumber: 10, newLineNumber: null },
            { type: 'removed', content: '', oldLineNumber: 11, newLineNumber: null },
            { type: 'removed', content: '## Architecture', oldLineNumber: 12, newLineNumber: null },
            { type: 'removed', content: '', oldLineNumber: 13, newLineNumber: null },
            {
              type: 'removed',
              content: 'See ARCHITECTURE.md for details.',
              oldLineNumber: 14,
              newLineNumber: null,
            },
            { type: 'removed', content: '', oldLineNumber: 15, newLineNumber: null },
          ],
        },
      ],
    },
  ];

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  return { files, totalAdditions, totalDeletions };
}
