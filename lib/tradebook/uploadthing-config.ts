export type WorkbookUploadAcl = "private" | "public-read";

export function getWorkbookUploadAcl(): WorkbookUploadAcl {
  const configured = process.env.UPLOADTHING_WORKBOOK_ACL?.trim();
  if (configured === "public-read" || configured === "private") {
    return configured;
  }
  return "private";
}
