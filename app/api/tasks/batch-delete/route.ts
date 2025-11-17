import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

const prisma = new PrismaClient();

/**
 * API (POST): /api/tasks/batch-delete
 * * 指定されたIDのタスク群を一括で削除します。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskIds } = body;

    // バリデーション
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    // Prisma の deleteMany を使用して、対象の全タスクを削除
    const deleteResult = await prisma.task.deleteMany({
      where: {
        id: {
          in: taskIds, // IDがリストに含まれるもの
        },
      },
    });

    return NextResponse.json({ count: deleteResult.count });

  } catch (error) {
    console.error("タスクの一括削除に失敗しました:", error);
    return NextResponse.json({ error: 'Failed to batch delete tasks' }, { status: 500 });
  }
}