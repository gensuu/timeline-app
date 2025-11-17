import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

// PrismaClientのインスタンスを作成します。
// これがデータベースとの対話（読み書き）を行うための「道具」です。
const prisma = new PrismaClient();

/**
 * API (GET): /api/tasks
 * * データベースに保存されている全てのタスクを取得します。
 * ユーザーの要件に基づき、必ず「時間 (timeInMinutes)」の昇順（早い順）で並べ替えます。
 */
export async function GET(request: NextRequest) {
  try {
    // データベースから 'Task' モデルのデータを全て検索 (findMany)
    const tasks = await prisma.task.findMany({
      // どのカラム（列）で並び替えるかを指定
      orderBy: {
        timeInMinutes: 'asc', // 'asc' = 昇順 (ascending)
      },
    });

    // 取得したタスク一覧をJSON形式でフロントエンドに返す
    return NextResponse.json(tasks);

  } catch (error) {
    // もしデータベース接続や検索でエラーが起きた場合
    console.error("タスクの取得に失敗しました:", error);
    // 500 Internal Server Error を返す
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

/**
 * API (POST): /api/tasks
 * * フロントエンドから送られてきた情報に基づき、新しいタスクをデータベースに作成します。
 */
export async function POST(request: NextRequest) {
  try {
    // リクエストの本文 (body) からJSONデータを取得
    const body = await request.json();
    const { title, timeInMinutes } = body;

    // 必須項目 (title と timeInMinutes) が存在するかチェック (バリデーション)
    if (!title || typeof timeInMinutes !== 'number') {
      // どちらかが欠けていれば 400 Bad Request (入力が不正) を返す
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    // データベースの 'Task' テーブルに新しいレコードを作成 (create)
    const newTask = await prisma.task.create({
      data: {
        title: title,
        timeInMinutes: timeInMinutes,
      },
    });

    // 成功したら、作成されたタスク情報と 201 Created ステータスを返す
    return NextResponse.json(newTask, { status: 201 });

  } catch (error) {
    // もしデータベースへの書き込みでエラーが起きた場合
    console.error("タスクの作成に失敗しました:", error);
    // 500 Internal Server Error を返す
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}