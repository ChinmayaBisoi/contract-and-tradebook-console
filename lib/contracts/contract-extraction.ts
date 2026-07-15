import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import {
  type ContractProposal,
  contractExtractionOutputSchema,
  parseContractJson,
} from "@/lib/contracts/contract-proposal";

type ResponsesClient = {
  parse: (
    request: Record<string, unknown>,
  ) => Promise<{ output_parsed: unknown }>;
};

type ExtractionErrorCode =
  | "NOT_CONFIGURED"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE";

export class ContractExtractionError extends Error {
  override name = "ContractExtractionError";

  constructor(
    public readonly code: ExtractionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export async function extractContractProposal({
  text,
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MAPPING_MODEL ?? "gpt-5-nano",
  responses,
}: {
  text: string;
  apiKey?: string;
  model?: string;
  responses?: ResponsesClient;
}): Promise<ContractProposal> {
  if (!apiKey) {
    throw new ContractExtractionError(
      "NOT_CONFIGURED",
      "AI contract extraction is unavailable until OPENAI_API_KEY is configured.",
    );
  }

  const client =
    responses ??
    ({
      parse: (request) => new OpenAI({ apiKey }).responses.parse(request),
    } as ResponsesClient);

  let response: { output_parsed: unknown };
  try {
    response = await client.parse({
      model,
      store: false,
      input: [
        {
          role: "system",
          content:
            "Extract only contract facts stated in the supplied text. Use YYYY-MM-DD dates, preserve units, and never invent missing commercial terms or line items.",
        },
        { role: "user", content: text },
      ],
      text: {
        format: zodTextFormat(
          contractExtractionOutputSchema,
          "contract_extraction",
        ),
      },
    });
  } catch (error) {
    throw new ContractExtractionError(
      "PROVIDER_ERROR",
      "AI contract extraction could not be completed. Please try again.",
      { cause: error },
    );
  }

  try {
    return parseContractJson(response.output_parsed);
  } catch (error) {
    throw new ContractExtractionError(
      "INVALID_RESPONSE",
      "AI contract extraction returned an invalid contract. Please try again or upload JSON.",
      { cause: error },
    );
  }
}
