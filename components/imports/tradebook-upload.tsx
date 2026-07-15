"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheetIcon, LockKeyholeIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { useUploadThing } from "@/lib/uploadthing-client";
import { useTRPC } from "@/trpc/client";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_BYTES = 32 * 1024 * 1024;

type PreflightStatus = "idle" | "running" | "complete" | "error";

type PreflightSummary = {
  sheets: Array<{ name: string; rowCount: number; columnCount: number }>;
  formulaCount: number;
};

type WorkerResponse =
  | { type: "complete"; summary: PreflightSummary }
  | { type: "error"; message: string };

function messageFrom(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The workbook could not be uploaded.";
}

function uploadConfirmationError(uploaded: unknown) {
  const file = Array.isArray(uploaded) ? uploaded[0] : null;
  if (file && typeof file === "object" && "error" in file && file.error) {
    return String(file.error);
  }
  return "UploadThing did not confirm the workbook upload.";
}

export function TradebookUpload({
  organisationId,
}: {
  organisationId: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preflightStatus, setPreflightStatus] = useState<PreflightStatus>("idle");
  const [preflightSummary, setPreflightSummary] = useState<PreflightSummary | null>(
    null,
  );
  const workerRef = useRef<Worker | null>(null);
  const createUpload = useMutation(
    trpc.tradebookImport.createUpload.mutationOptions(),
  );
  const markUploadFailed = useMutation(
    trpc.tradebookImport.markUploadFailed.mutationOptions(),
  );
  const prepare = useMutation(trpc.tradebookImport.prepare.mutationOptions());
  const { startUpload, isUploading } = useUploadThing("tradebookWorkbook", {
    onUploadProgress: setProgress,
  });
  const pending = createUpload.isPending || isUploading || prepare.isPending;

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  async function runPreflight(nextFile: File) {
    workerRef.current?.terminate();
    workerRef.current = null;
    setPreflightStatus("running");
    setPreflightSummary(null);
    try {
      const buffer = await nextFile.arrayBuffer();
      const worker = new Worker(
        new URL("./tradebook-preflight.worker.ts", import.meta.url),
      );
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        if (message.type === "complete") {
          setPreflightSummary(message.summary);
          setPreflightStatus("complete");
        } else {
          setPreflightStatus("error");
          setError(message.message);
        }
        worker.terminate();
        if (workerRef.current === worker) {
          workerRef.current = null;
        }
      };
      worker.onerror = () => {
        setPreflightStatus("error");
        setError("Workbook preview parse failed. You can still upload.");
        worker.terminate();
        if (workerRef.current === worker) {
          workerRef.current = null;
        }
      };
      worker.postMessage(buffer, [buffer]);
    } catch (workerError) {
      setPreflightStatus("error");
      setError(
        workerError instanceof Error
          ? workerError.message
          : "Workbook preview parse failed. You can still upload.",
      );
    }
  }

  function prepareInBackground(uploadId: string) {
    void (async () => {
      const parsingToastId = toast.loading("Parsing workbook...");
      try {
        await prepare.mutateAsync({ organisationId, importId: uploadId });
        await queryClient.invalidateQueries(
          trpc.tradebookImport.list.queryFilter({ organisationId }),
        );
        toast.success("Workbook prepared for review", {
          id: parsingToastId,
        });
      } catch (error) {
        const message = messageFrom(error);
        await markUploadFailed
          .mutateAsync({ organisationId, uploadId, message })
          .catch(() => undefined);
        await queryClient.invalidateQueries(
          trpc.tradebookImport.list.queryFilter({ organisationId }),
        );
        toast.error(message, { id: parsingToastId });
      }
    })();
  }

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setError(null);
    setProgress(2);
    let uploadId: string | null = null;

    try {
      const created = await createUpload.mutateAsync({
        organisationId,
        fileName: file.name,
        mimeType: XLSX_MIME,
        fileSizeBytes: file.size,
      });
      uploadId = created.uploadId;
      const uploaded = await startUpload([file], { organisationId, uploadId });
      if (!uploaded?.[0]?.serverData?.importReady) {
        throw new Error(uploadConfirmationError(uploaded));
      }
      setProgress(100);
      router.push(`/org/${organisationId}/imports/${uploadId}`);
      prepareInBackground(uploadId);
    } catch (uploadError) {
      const message = messageFrom(uploadError);
      setError(message);
      toast.error(message);
      if (uploadId) {
        await markUploadFailed
          .mutateAsync({ organisationId, uploadId, message })
          .catch(() => undefined);
      }
    }
  }

  return (
    <Card className="border-dashed bg-[linear-gradient(135deg,var(--card),color-mix(in_oklch,var(--muted)_55%,transparent))]">
      <CardHeader className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border bg-background p-2 text-foreground shadow-xs">
            <FileSpreadsheetIcon aria-hidden="true" className="size-5" />
          </div>
          <div>
            <h3 className="font-heading font-medium">
              Import an Excel tradebook
            </h3>
            <p className="max-w-2xl text-sm text-muted-foreground">
              The original workbook remains private. We preserve formulas and
              ask you to review mappings and validation before any contracts are
              created.
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LockKeyholeIcon aria-hidden="true" className="size-3.5" />
          Private · .xlsx · 32 MB max
        </span>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 md:grid-cols-[1fr_auto]"
          onSubmit={handleUpload}
        >
          <Input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="Select Excel workbook"
            disabled={pending}
            required
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setError(null);
              setPreflightSummary(null);
              setPreflightStatus("idle");
              if (
                next &&
                (next.size > MAX_BYTES ||
                  !next.name.toLowerCase().endsWith(".xlsx"))
              ) {
                setFile(null);
                setError("Select one .xlsx workbook no larger than 32 MB.");
                return;
              }
              setFile(next);
              if (next) {
                void runPreflight(next);
              }
            }}
          />
          <Button type="submit" disabled={!file || pending}>
            <UploadIcon aria-hidden="true" />
            {prepare.isPending
              ? "Preparing review..."
              : isUploading
                ? "Uploading..."
                : "Upload and review"}
          </Button>
          {pending ? (
            <Progress
              value={prepare.isPending ? 100 : progress}
              className="md:col-span-2"
            >
              <ProgressLabel>
                {prepare.isPending
                  ? "Reading sheets and formulas"
                  : "Private upload"}
              </ProgressLabel>
              <ProgressValue>
                {() => (prepare.isPending ? "Processing" : `${progress}%`)}
              </ProgressValue>
            </Progress>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive md:col-span-2">
              {error} Select the file again to retry.
            </p>
          ) : null}
          {file ? (
            <p className="text-xs text-muted-foreground md:col-span-2">
              {preflightStatus === "running"
                ? "Parsing workbook in background worker..."
                : preflightStatus === "complete"
                  ? `${preflightSummary?.sheets.length ?? 0} sheets detected · ${preflightSummary?.formulaCount ?? 0} formulas`
                  : preflightStatus === "error"
                    ? "Preflight parsing failed. Upload can still continue."
                    : "Workbook ready for preflight parse."}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
