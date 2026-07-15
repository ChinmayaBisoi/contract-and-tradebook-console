"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheetIcon, LockKeyholeIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

function messageFrom(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The workbook could not be uploaded.";
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
        throw new Error("Private storage did not confirm the workbook upload.");
      }
      setProgress(100);
      await prepare.mutateAsync({ organisationId, importId: uploadId });
      await queryClient.invalidateQueries(
        trpc.tradebookImport.list.queryFilter({ organisationId }),
      );
      toast.success("Workbook prepared for review");
      router.push(`/org/${organisationId}/imports/${uploadId}`);
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
        </form>
      </CardContent>
    </Card>
  );
}
