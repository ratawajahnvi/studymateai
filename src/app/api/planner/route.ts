import { NextRequest, NextResponse } from "next/server";
import { requireStudentSession } from "@/lib/auth/session";
import {
  createStudyPlanWithItems,
  listStudentStudyPlans,
  touchStudentLastActive,
  updateStudyPlanItem,
} from "@/lib/db/repository";
import {
  computeStudyPlannerAnalytics,
  generateDeterministicScheduleItems,
} from "@/lib/features/deterministic";
import { toApiErrorResponse } from "@/lib/http/errors";
import {
  CreateStudyPlanSchema,
  UpdateStudyPlanItemSchema,
} from "@/lib/validation/schemas";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    const { plans, items } = await listStudentStudyPlans(session.sub);

    const activePlan = plans[0] ?? null;
    const analytics = activePlan
      ? computeStudyPlannerAnalytics(
          activePlan.exam_date,
          items.filter((i) => i.plan_id === activePlan.id)
        )
      : null;

    return NextResponse.json({
      ok: true,
      plans,
      items,
      analytics,
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    await touchStudentLastActive(session.sub);

    const body = await request.json();
    const parsed = CreateStudyPlanSchema.parse(body);

    const todayStr = new Date().toISOString().slice(0, 10);
    const itemsToCreate =
      parsed.items.length > 0
        ? parsed.items
        : generateDeterministicScheduleItems({
            startDate: todayStr,
            examDate: parsed.examDate,
            dailyTargetHours: parsed.dailyTargetHours,
            topics: [],
          });

    const created = await createStudyPlanWithItems({
      studentProfileId: session.sub,
      title: parsed.title,
      examName: parsed.examName,
      examDate: parsed.examDate,
      dailyTargetHours: parsed.dailyTargetHours,
      items: itemsToCreate,
    });

    const analytics = computeStudyPlannerAnalytics(created.plan.exam_date, created.items);

    return NextResponse.json(
      {
        ok: true,
        plan: created.plan,
        items: created.items,
        analytics,
      },
      { status: 201 }
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    await touchStudentLastActive(session.sub);

    const body = await request.json();
    const parsed = UpdateStudyPlanItemSchema.parse(body);

    const updatedItem = await updateStudyPlanItem({
      studentProfileId: session.sub,
      itemId: parsed.itemId,
      status: parsed.status,
      scheduledDate: parsed.scheduledDate,
      durationMinutes: parsed.durationMinutes,
      priority: parsed.priority,
      topic: parsed.topic,
    });

    return NextResponse.json({
      ok: true,
      item: updatedItem,
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
