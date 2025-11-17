import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

const prisma = new PrismaClient();

/**
 * API (GET): /api/templates
 * * 保存されている全てのテンプレートを取得します。
 * （テンプレート内のタスクも一緒に取得します）
 */
export async function GET(request: NextRequest) {
  try {
    const templates = await prisma.template.findMany({
      include: {
        tasks: {
          orderBy: {
            timeOffsetInMinutes: 'asc', // テンプレート内のタスクも時間順で
          },
        },
      },
      orderBy: {
        createdAt: 'desc', // 新しいテンプレートから順
      },
    });
    return NextResponse.json(templates);
  } catch (error) {
    console.error("テンプレートの取得に失敗しました:", error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

/**
 * API (POST): /api/templates
 * * 選択されたタスク群から新しいテンプレートを作成します。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, tasks } = body; // tasks = [{ title: string, timeInMinutes: number }, ...]

    // バリデーション
    if (!name || !Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    // タスク群を時間順にソートし、最初のタスクの時間を「0」とする
    const sortedTasks = tasks.sort((a, b) => a.timeInMinutes - b.timeInMinutes);
    const firstTaskTime = sortedTasks[0].timeInMinutes;

    // テンプレート内のタスクデータを作成（相対時間に変換）
    const templateTasksData = sortedTasks.map(task => ({
      title: task.title,
      timeOffsetInMinutes: task.timeInMinutes - firstTaskTime, // 相対時間に変換
    }));

    // データベースに新しい「Template」を作成し、
    // 同時に「TemplateTask」も作成（ネストした create）
    const newTemplate = await prisma.template.create({
      data: {
        name: name,
        tasks: {
          create: templateTasksData, // 関連するタスクも一括作成
        },
      },
      include: {
        tasks: true, // 作成したタスクも返す
      },
    });

    return NextResponse.json(newTemplate, { status: 201 });
  } catch (error) {
    console.error("テンプレートの作成に失敗しました:", error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}