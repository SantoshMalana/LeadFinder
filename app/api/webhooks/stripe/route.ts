import { NextResponse } from 'next/server'

export async function POST() {
  // Stripe webhook handler — coming in Phase 4
  return NextResponse.json({ received: true })
}