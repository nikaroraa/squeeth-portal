import { NextRequest, NextResponse } from 'next/server'

const BLOCKED_COUNTRIES = ['US', 'BY', 'CU', 'IR', 'IQ', 'CI', 'LR', 'KP', 'SD', 'SY', 'ZW']

export function middleware(req: NextRequest) {
  const country = req?.geo?.country
  const response = NextResponse.next()
  console.log(country)

  if (country && BLOCKED_COUNTRIES.includes(country)) {
    return NextResponse.rewrite('/blocked')
  }

  return response
}