import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

const prisma = new PrismaClient();

/**
 * API (POST): /api/tasks/batch-update
 * * 指定されたIDのタスク群の時間を一括で更新（増減）します。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskIds, deltaMinutes } = body;

    // バリデーション
    if (!Array.isArray(taskIds) || typeof deltaMinutes !== 'number') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    // Prisma の updateMany を使用して、対象の全タスクの timeInMinutes を増減
    const updateResult = await prisma.task.updateMany({
      where: {
        id: {
          in: taskIds, // IDがリストに含まれるもの
        },
      },
      data: {
        timeInMinutes: {
          increment: deltaMinutes, // 受け取った分数だけ増やす (マイナスも可)
        },
      },
    });

    return NextResponse.json({ count: updateResult.count });

  } catch (error) {
    console.error("タスクの一括更新に失敗しました:", error);
    return NextResponse.json({ error: 'Failed to batch update tasks' }, { status: 500 });
  }
}