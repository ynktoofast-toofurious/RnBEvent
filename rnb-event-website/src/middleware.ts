import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export default async function middleware(request: NextRequest) {
  const session = await auth()
  
  // Check if user is accessing admin routes
  if (request.nextUrl.pathname.startsWith('/admin')) {
    // If not authenticated, redirect to signin
    if (!session?.user) {
      const signInUrl = new URL('/auth/signin', request.url)
      signInUrl.searchParams.set('callbackUrl', request.url)
      return NextResponse.redirect(signInUrl)
    }
    
    // If authenticated but not admin, redirect to home
    if (session.user.role !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*']
}