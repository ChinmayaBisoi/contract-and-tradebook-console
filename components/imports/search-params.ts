import {
  createParser,
  parseAsInteger,
  parseAsStringLiteral,
} from "nuqs/server";

const pageSizes = [10, 20, 50] as const;
const statuses = ["PENDING", "MAPPED", "IMPORTED", "FAILED"] as const;

const pageSizeParser = createParser({
  parse(value) {
    const parsed = Number.parseInt(value, 10);
    return pageSizes.includes(parsed as (typeof pageSizes)[number])
      ? (parsed as (typeof pageSizes)[number])
      : null;
  },
  serialize: String,
});

export const importSearchParams = {
  status: parseAsStringLiteral(statuses),
  page: parseAsInteger.withDefault(1),
  pageSize: pageSizeParser.withDefault(10),
};

export function getImportListInput(
  organisationId: string,
  state: {
    status: (typeof statuses)[number] | null;
    page: number;
    pageSize: (typeof pageSizes)[number];
  },
) {
  return {
    organisationId,
    page: state.page,
    pageSize: state.pageSize,
    ...(state.status ? { status: state.status } : {}),
  };
}
