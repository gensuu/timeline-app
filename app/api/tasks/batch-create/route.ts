import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

const prisma = new PrismaClient();

/**
 * API (POST): /api/tasks/batch-create
 * * テンプレートIDと開始時間に基づき、複数のタスクを一括で作成します。
 * ★ 修正: 作成したタスクの「リスト」を返すように変更
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // templateId: どのテンプレートを使うか
    // startTimeInMinutes: タイムラインのどこに追加するか (例: 13:00 -> 780)
    const { templateId, startTimeInMinutes } = body;

    // バリデーション
    if (!templateId || typeof startTimeInMinutes !== 'number') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    // 1. データベースからテンプレート（と、その中のタスク）を取得
    const template = await prisma.template.findUnique({
      where: { id: templateId },
      include: { tasks: true },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    if (template.tasks.length === 0) {
      return NextResponse.json({ error: 'Template has no tasks' }, { status: 400 });
    }

    // 2. タイムラインに追加するタスクのデータを作成
    const newTasksData = template.tasks.map(templateTask => ({
      title: templateTask.title,
      // 開始時間 + テンプレート内の相対時間
      timeInMinutes: startTimeInMinutes + templateTask.timeOffsetInMinutes,
    }));

    // 3. ★ 修正: createMany の代わりに $transaction と create を使い、
    // 作成されたタスクを「返す」
    const newTasks = await prisma.$transaction(
      newTasksData.map(taskData => 
        prisma.task.create({
          data: taskData,
        })
      )
    );

    // ★ 修正: 作成したタスクの「リスト」を返す
    return NextResponse.json(newTasks, { status: 201 });

  } catch (error) {
    console.error("テンプレートからの一括作成に失敗しました:", error);
    return NextResponse.json({ error: 'Failed to create tasks from template' }, { status: 500 });
  }
}