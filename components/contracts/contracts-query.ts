export function getDefaultContractListInput(organisationId: string) {
  return {
    organisationId,
    filters: {},
    page: 1,
    pageSize: 20 as const,
    sort: "updatedAt" as const,
    sortDirection: "desc" as const,
  };
}
