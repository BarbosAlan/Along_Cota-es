import { z } from 'zod';
import { isValid, parseISO, isAfter } from 'date-fns';

const BLOCKCHAIN_IDS = [
  'ethereum',
  'polygon',
  'bitcoin',
  'solana',
  'tron',
  'terra',
  'cardano',
  'xrp',
  'lisk',
] as const;

export const searchRequestSchema = z
  .object({
    walletAddress: z.string().min(10).max(128).trim(),
    startDate: z
      .string()
      .refine(s => isValid(parseISO(s)), 'Data inicial inválida'),
    endDate: z
      .string()
      .refine(s => isValid(parseISO(s)), 'Data final inválida'),
    forceRefresh: z.boolean().optional(),
  })
  .refine(data => !isAfter(parseISO(data.startDate), parseISO(data.endDate)), {
    message: 'A data inicial deve ser anterior ou igual à data final',
    path: ['startDate'],
  })
  .refine(data => !isAfter(parseISO(data.endDate), new Date()), {
    message: 'A data final não pode ser futura',
    path: ['endDate'],
  });

const enrichedTransactionRowSchema = z.object({
  id: z.string(),
  txHash: z.string(),
  date: z.string(),
  type: z.enum(['receive', 'send', 'swap', 'fee', 'unknown']),
  assetSymbol: z.string(),
  amount: z.string(),
  priceUsd: z.number().nullable(),
  valueUsd: z.number().nullable(),
  ptax: z.number().nullable(),
  valueBrl: z.number().nullable(),
  fromAddress: z.string().nullable(),
  toAddress: z.string().nullable(),
  sourceApi: z.string(),
  blockchain: z.enum(['ethereum', 'polygon', 'bitcoin', 'solana', 'tron', 'terra', 'cardano', 'xrp', 'lisk']),
});

export const exportRequestSchema = z.object({
  transactions: z.array(enrichedTransactionRowSchema),
  format: z.enum(['xlsx', 'csv']),
  walletAddress: z.string(),
});

export const quotesRequestSchema = z
  .object({
    symbol: z.string().min(1).max(20).trim().toUpperCase(),
    startDate: z.string().refine(s => isValid(parseISO(s)), 'Data inicial inválida'),
    endDate: z.string().refine(s => isValid(parseISO(s)), 'Data final inválida'),
  })
  .refine(data => !isAfter(parseISO(data.startDate), parseISO(data.endDate)), {
    message: 'A data inicial deve ser anterior ou igual à data final',
    path: ['startDate'],
  })
  .refine(data => !isAfter(parseISO(data.endDate), new Date()), {
    message: 'A data final não pode ser futura',
    path: ['endDate'],
  })
  .refine(
    data => {
      const ms = parseISO(data.endDate).getTime() - parseISO(data.startDate).getTime();
      return ms / (1000 * 60 * 60 * 24) <= 366;
    },
    { message: 'Período máximo de 366 dias', path: ['endDate'] }
  );

const quoteRowSchema = z.object({
  date: z.string(),
  symbol: z.string(),
  priceUsd: z.number().nullable(),
  ptax: z.number().nullable(),
  priceBrl: z.number().nullable(),
  priceSource: z.string().nullable(),
});

export const quotesExportRequestSchema = z.object({
  quotes: z.array(quoteRowSchema),
  symbol: z.string(),
  format: z.enum(['xlsx', 'csv']),
});

export const batchRequestSchema = z
  .object({
    addresses: z
      .array(z.string().min(10).max(128).trim())
      .min(1, 'Informe ao menos um endereço')
      .max(10, 'Máximo de 10 endereços por busca'),
    startDate: z
      .string()
      .refine(s => isValid(parseISO(s)), 'Data inicial inválida'),
    endDate: z
      .string()
      .refine(s => isValid(parseISO(s)), 'Data final inválida'),
    forceRefresh: z.boolean().optional(),
  })
  .refine(data => !isAfter(parseISO(data.startDate), parseISO(data.endDate)), {
    message: 'A data inicial deve ser anterior ou igual à data final',
    path: ['startDate'],
  })
  .refine(data => !isAfter(parseISO(data.endDate), new Date()), {
    message: 'A data final não pode ser futura',
    path: ['endDate'],
  });
