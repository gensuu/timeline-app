import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

const prisma = new PrismaClient();

interface RequestParams {
  params: {
    id: string; // URLの [id] 部分がここに入ります
  };
}

/**
 * API (PUT): /api/tasks/[id]
 * * 指定されたIDのタスクを更新します。
 */
export async function PUT(request: NextRequest, { params }: RequestParams) {
  try {
    const { id } = params;
    // IDが存在しない場合はエラー
    if (!id) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const { title, timeInMinutes } = body;

    // バリデーション
    if (!title || typeof timeInMinutes !== 'number') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    // データベースのタスクを更新
    const updatedTask = await prisma.task.update({
      where: {
        id: id, // URLから取得したIDでタスクを特定
      },
      data: {
        title: title,
        timeInMinutes: timeInMinutes,
      },
    });

    return NextResponse.json(updatedTask);

  } catch (error) {
    console.error("タスクの更新に失敗しました:", error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

/**
 * API (DELETE): /api/tasks/[id]
 * * 指定されたIDのタスクを削除します。
 * (堅牢なエラーハンドリングを追加)
 */
export async function DELETE(request: NextRequest, { params }: RequestParams) {
  try {
    const { id } = params;
    // IDが存在しない場合はエラー
    if (!id) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    // データベースからタスクを削除
    await prisma.task.delete({
      where: {
        id: id, // URLから取得したIDでタスクを特定
      },
    });

    // 成功したら 204 No Content (中身なし) ステータスを返す
    return new NextResponse(null, { status: 204 });

  } catch (error) {
    console.error("タスクの削除に失敗しました:", error);
    // 削除対象が見つからなかった場合などのエラーハンドリング
    if (error instanceof Error && 'code' in error && error.code === 'P2025') {
       return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}