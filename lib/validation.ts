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

export const exportRequestSchema = z.object({
  transactions: z.array(z.any()),
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

export const quotesExportRequestSchema = z.object({
  quotes: z.array(z.any()),
  symbol: z.string(),
  format: z.enum(['xlsx', 'csv']),
});
