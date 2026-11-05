import {
  downloadMaterialBufferFromStorage,
  saveExtractedDocumentChunks,
  updateMaterialAndJobStatus,
} from "../db/repository";
import { extractDocumentContent } from "./extractor";

/**
 * Executes chunked document extraction with status tracking, progress updates,
 * and automatic failure state persistence.
 */
export async function processStudyMaterialJob(params: {
  studentProfileId: string;
  materialId: string;
  inlineBuffer?: Buffer;
}): Promise<{
  materialId: string;
  status: "completed" | "failed";
  unitCount: number;
  chunkCount: number;
  errorMessage?: string;
}> {
  await updateMaterialAndJobStatus({
    studentProfileId: params.studentProfileId,
    materialId: params.materialId,
    materialStatus: "processing",
    jobStatus: "running",
    progressPercent: 15,
    errorMessage: null,
  });

  try {
    const downloaded = await downloadMaterialBufferFromStorage({
      studentProfileId: params.studentProfileId,
      materialId: params.materialId,
    });

    const fileBuffer = params.inlineBuffer ?? downloaded.buffer;
    const material = downloaded.material;

    await updateMaterialAndJobStatus({
      studentProfileId: params.studentProfileId,
      materialId: params.materialId,
      materialStatus: "processing",
      jobStatus: "running",
      progressPercent: 45,
    });

    const extracted = await extractDocumentContent({
      buffer: fileBuffer,
      filename: material.original_filename,
      mimeType: material.mime_type,
    });

    await updateMaterialAndJobStatus({
      studentProfileId: params.studentProfileId,
      materialId: params.materialId,
      materialStatus: "processing",
      jobStatus: "running",
      progressPercent: 80,
      pageOrUnitCount: extracted.unitCount,
      totalChunks: extracted.chunks.length,
    });

    await saveExtractedDocumentChunks({
      studentProfileId: params.studentProfileId,
      materialId: params.materialId,
      chunks: extracted.chunks,
    });

    await updateMaterialAndJobStatus({
      studentProfileId: params.studentProfileId,
      materialId: params.materialId,
      materialStatus: "completed",
      jobStatus: "completed",
      progressPercent: 100,
      pageOrUnitCount: extracted.unitCount,
      totalChunks: extracted.chunks.length,
      processedChunks: extracted.chunks.length,
      errorMessage: null,
    });

    return {
      materialId: params.materialId,
      status: "completed",
      unitCount: extracted.unitCount,
      chunkCount: extracted.chunks.length,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Document processing failed unexpectedly.";

    await updateMaterialAndJobStatus({
      studentProfileId: params.studentProfileId,
      materialId: params.materialId,
      materialStatus: "failed",
      jobStatus: "failed",
      progressPercent: 0,
      errorMessage,
    });

    return {
      materialId: params.materialId,
      status: "failed",
      unitCount: 0,
      chunkCount: 0,
      errorMessage,
    };
  }
}
