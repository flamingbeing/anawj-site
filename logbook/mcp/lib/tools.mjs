// The MCP tools: read-only, each a zod input shape and a handler returning text.
// getData() -> { email, cases, reflections, logbook, resident }; injected so tests need no network.

import { z } from 'zod';
import {
  MAX_LIMIT, DEFAULT_LIMIT, filterCases, searchCases, formatCaseList, resolveYear, formatProgress,
  formatMissing, filterReflections, formatReflectionList, formatReflection, catName,
} from './logbook.mjs';

const limit = z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Most rows to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const year = z.number().int().min(1).max(5).optional().describe('Residency year 1-5 (R1, R2, R3, SR1, SR2). Default: from the programme list or your Settings');

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function defineTools(getData) {
  return [
    {
      name: 'list_cases',
      title: 'List logbook cases',
      description: 'List your logged cases, newest first, optionally between two dates and for one APMES tag (category code like "16" or a name like "caesarean").',
      shape: { from: date.optional().describe('First date, YYYY-MM-DD'), to: date.optional().describe('Last date, YYYY-MM-DD'), category: z.string().max(100).optional(), limit },
      async run(args) {
        const d = await getData();
        const r = filterCases(d.cases, args);
        return formatCaseList(r, r.codes ? `cases tagged ${r.codes.map(c => `"${catName(c)}"`).join(' or ')}` : 'cases');
      },
    },
    {
      name: 'search_cases',
      title: 'Search logbook cases',
      description: 'Find cases whose initials, details or tag names contain every word given (any case; "quoted phrase" stays whole).',
      shape: { text: z.string().min(1).max(500), limit },
      async run({ text, limit: n }) {
        const d = await getData();
        return formatCaseList(searchCases(d.cases, text, { limit: n }), `cases matching "${text}"`);
      },
    },
    {
      name: 'progress',
      title: 'Progress against APMES targets',
      description: 'Per-tag case counts against the cumulative APMES targets for your residency year.',
      shape: { year },
      async run(args) {
        const d = await getData();
        return formatProgress(d.cases, resolveYear({ year: args.year, resident: d.resident, logbook: d.logbook }));
      },
    },
    {
      name: 'list_reflections',
      title: 'List reflections',
      description: 'List your reflections by heading, with id, title, date and status. Filter by heading (id or name) and status.',
      shape: { heading: z.string().max(200).optional(), status: z.enum(['draft', 'complete']).optional(), limit },
      async run(args) {
        const d = await getData();
        return formatReflectionList(filterReflections(d.reflections, args), args.limit);
      },
    },
    {
      name: 'get_reflection',
      title: 'Read one reflection',
      description: 'The full text of one reflection (id from list_reflections).',
      shape: { id: z.string().min(1).max(200) },
      async run({ id }) {
        const d = await getData();
        const r = d.reflections.find(x => String(x.id) === id);
        if (!r) throw new Error(`No reflection with id "${id}". Use list_reflections to find ids.`);
        return formatReflection(r);
      },
    },
    {
      name: 'missing_targets',
      title: 'What is missing',
      description: 'APMES tags behind or due for your residency year, and reflection headings below their minimum.',
      shape: { year },
      async run(args) {
        const d = await getData();
        return formatMissing(d.cases, d.reflections, resolveYear({ year: args.year, resident: d.resident, logbook: d.logbook }));
      },
    },
  ];
}

// Runs a tool and wraps its text (or error) as an MCP result.
export async function callTool(tool, args) {
  try {
    const text = await tool.run(args || {});
    return { content: [{ type: 'text', text }] };
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: e && e.message ? e.message : String(e) }] };
  }
}
