import { UTApi } from "uploadthing/server";

import { getWorkbookUploadAcl } from "@/lib/tradebook/uploadthing-config";

type PrivateUrlSigner = {
  generateSignedURL: (
    key: string,
    options: { expiresIn: "5 minutes" },
  ) => Promise<{ ufsUrl: string }>;
};

export async function getPrivateWorkbookUrl(
  storageKey: string,
  signer: PrivateUrlSigner = new UTApi(),
) {
  const result = await signer.generateSignedURL(storageKey, {
    expiresIn: "5 minutes",
  });

  return result.ufsUrl;
}

export async function getWorkbookReadUrl(
  input: { storageKey: string; blobUrl: string | null },
  signer?: PrivateUrlSigner,
) {
  if (getWorkbookUploadAcl() === "public-read") {
    if (!input.blobUrl) {
      throw new Error("Workbook storage URL is missing.");
    }
    return input.blobUrl;
  }

  return getPrivateWorkbookUrl(input.storageKey, signer ?? new UTApi());
}
