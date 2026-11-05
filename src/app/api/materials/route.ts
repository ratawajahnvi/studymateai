import { NextRequest, NextResponse } from "next/server";
import { requireStudentSession } from "@/lib/auth/session";
import {
  createStudyMaterialWithSignedUpload,
  getExtractedDocumentChunks,
  listStudentMaterials,
  listStudentProcessingJobs,
  touchStudentLastActive,
  uploadMaterialBufferToStorage,
} from "@/lib/db/repository";
import { getValidatedExtension } from "@/lib/documents/extractor";
import { processStudyMaterialJob } from "@/lib/documents/processor";
import { toApiErrorResponse } from "@/lib/http/errors";
import {
  CreateMaterialUploadSchema,
  MAX_UPLOAD_SIZE_BYTES,
} from "@/lib/validation/schemas";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    const [materials, jobs] = await Promise.all([
      listStudentMaterials(session.sub),
      listStudentProcessingJobs(session.sub),
    ]);

    return NextResponse.json({
      ok: true,
      materials,
      jobs,
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    await touchStudentLastActive(session.sub);

    const contentType = request.headers.get("content-type") ?? "";

    // Mode 1: Direct-to-Storage Signed Upload URL initialization for large files
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const parsed = CreateMaterialUploadSchema.parse(body);
      const fileExtension = getValidatedExtension(parsed.originalFilename);

      const created = await createStudyMaterialWithSignedUpload({
        studentProfileId: session.sub,
        title: parsed.title,
        originalFilename: parsed.originalFilename,
        mimeType: parsed.mimeType,
        fileExtension,
        fileSizeBytes: parsed.fileSizeBytes,
      });

      return NextResponse.json(
        {
          ok: true,
          material: created.material,
          job: created.job,
          signedUploadUrl: created.signedUploadUrl,
          storageToken: created.storageToken,
        },
        { status: 201 }
      );
    }

    // Mode 2: Multipart FormData upload -> Supabase Storage -> Chunked Extraction
    const formData = await request.formData();
    const file = formData.get("file");
    const rawTitle = String(formData.get("title") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "A valid file attachment is required." },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { ok: false, error: "Cannot upload an empty (0 byte) file." },
        { status: 400 }
      );
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error: "File exceeds the 50 MB maximum supported processing limit.",
        },
        { status: 400 }
      );
    }

    const fileExtension = getValidatedExtension(file.name);
    const title = rawTitle.length >= 2 ? rawTitle : file.name.replace(/\.[^.]+$/, "");
    const parsedMeta = CreateMaterialUploadSchema.parse({
      title,
      originalFilename: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSizeBytes: file.size,
    });

    const created = await createStudyMaterialWithSignedUpload({
      studentProfileId: session.sub,
      title: parsedMeta.title,
      originalFilename: parsedMeta.originalFilename,
      mimeType: parsedMeta.mimeType,
      fileExtension,
      fileSizeBytes: parsedMeta.fileSizeBytes,
    });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await uploadMaterialBufferToStorage({
      studentProfileId: session.sub,
      materialId: created.material.id,
      buffer,
      mimeType: parsedMeta.mimeType,
    });

    const processingResult = await processStudyMaterialJob({
      studentProfileId: session.sub,
      materialId: created.material.id,
      inlineBuffer: buffer,
    });

    const [updatedMaterials, updatedJobs, extractedChunks] = await Promise.all([
      listStudentMaterials(session.sub),
      listStudentProcessingJobs(session.sub),
      getExtractedDocumentChunks(session.sub, created.material.id).catch(() => []),
    ]);
    const finalMaterial =
      updatedMaterials.find((m) => m.id === created.material.id) ?? created.material;
    const finalJob =
      updatedJobs.find((j) => j.material_id === created.material.id) ?? created.job;

    return NextResponse.json(
      {
        ok: processingResult.status === "completed",
        material: finalMaterial,
        job: finalJob,
        extractedChunks,
        processing: processingResult,
      },
      { status: processingResult.status === "completed" ? 201 : 422 }
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
