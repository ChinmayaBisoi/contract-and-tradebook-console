import { UTApi } from "uploadthing/server";

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
