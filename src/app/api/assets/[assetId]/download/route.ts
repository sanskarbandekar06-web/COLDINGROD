import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ASSET_BUCKET } from '@/lib/asset-utils';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;
  if (!UUID_PATTERN.test(assetId)) {
    return new Response('Invalid file identifier.', { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Authentication required.', { status: 401 });

  const { data: asset, error: assetError } = await supabase
    .from('assets')
    .select('name, file_path')
    .eq('id', assetId)
    .maybeSingle();

  if (assetError || !asset) {
    return new Response('File not found.', { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from(ASSET_BUCKET)
    .createSignedUrl(asset.file_path, 60, { download: asset.name });

  if (error || !data?.signedUrl) {
    console.error('Create asset download URL error:', error);
    return new Response('The file is temporarily unavailable.', { status: 503 });
  }

  return NextResponse.redirect(data.signedUrl);
}
