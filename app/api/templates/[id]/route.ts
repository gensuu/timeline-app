import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

const prisma = new PrismaClient();

interface RequestParams {
  params: {
    id: string; // URLの [id] 部分がここに入ります
  };
}

/**
 * API (DELETE): /api/templates/[id]
 * * 指定されたIDのテンプレートを削除します。
 * (prisma/schema.prisma の onDelete: Cascade により、
 * 関連する TemplateTask も自動で削除されます)
 */
export async function DELETE(request: NextRequest, { params }: RequestParams) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
    }

    await prisma.template.delete({
      where: {
        id: id,
      },
    });

    return new NextResponse(null, { status: 204 });

  } catch (error) {
    console.error("テンプレートの削除に失敗しました:", error);
    if (error instanceof Error && 'code' in error && error.code === 'P2025') {
       return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}