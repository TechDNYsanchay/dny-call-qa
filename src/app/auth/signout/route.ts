import { NextResponse, type NextRequest } from "next/server";
import { supabaseUser } from "@/lib/supabase/server";

async function signOut(request: NextRequest) {
  const supabase = await supabaseUser();
  await supabase.auth.signOut();
  const reason = request.nextUrl.searchParams.get("reason") === "no-access" ? "?error=no-access" : "";
  return NextResponse.redirect(new URL(`/login${reason}`, request.nextUrl.origin), { status: 303 });
}

// POST from the header's sign-out button; GET when a page finds the person is not on the team list.
export const POST = signOut;
export const GET = signOut;
