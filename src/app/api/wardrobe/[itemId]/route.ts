import { connection } from 'next/server';
import {
  handleDeleteItem,
  handleGetItem,
  handleUpdateItem,
} from '@/lib/wardrobe/wardrobeHandlers';

interface ItemRouteContext {
  params: Promise<{ itemId: string }>;
}

export async function GET(req: Request, { params }: ItemRouteContext): Promise<Response> {
  // Reads the session, so it must never be prerendered.
  await connection();
  const { itemId } = await params;
  return handleGetItem(req, itemId);
}

export async function PATCH(req: Request, { params }: ItemRouteContext): Promise<Response> {
  const { itemId } = await params;
  return handleUpdateItem(req, itemId);
}

export async function DELETE(req: Request, { params }: ItemRouteContext): Promise<Response> {
  const { itemId } = await params;
  return handleDeleteItem(req, itemId);
}
