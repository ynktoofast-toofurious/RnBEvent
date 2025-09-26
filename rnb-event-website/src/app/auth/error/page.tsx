'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, AlertTriangle } from 'lucide-react'

export default function AuthErrorPage() {
  const searchParams = useSearchParams()
  const error = searchParams?.get('error')

  const getErrorMessage = (error: string | null) => {
    switch (error) {
      case 'Configuration':
        return 'There is a problem with the server configuration.'
      case 'AccessDenied':
        return 'Access denied. You do not have permission to sign in.'
      case 'Verification':
        return 'The verification token has expired or has already been used.'
      default:
        return 'An error occurred during authentication. Please try again.'
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <Link 
            href="/"
            className="inline-flex items-center text-yellow-500 hover:text-yellow-400 transition-colors mb-8"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Link>
          <div className="text-3xl font-bold text-white mb-2">
            RnB<span className="text-yellow-500">Event</span>
          </div>
        </div>

        {/* Error Card */}
        <div className="bg-gray-900 rounded-2xl p-8 shadow-xl border border-red-500/20">
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            
            <div>
              <h2 className="text-xl font-semibold text-white mb-2">
                Authentication Error
              </h2>
              <p className="text-gray-300">
                {getErrorMessage(error)}
              </p>
            </div>

            <div className="space-y-3">
              <Link
                href="/auth/signin"
                className="w-full inline-flex items-center justify-center px-4 py-3 bg-yellow-500 hover:bg-yellow-600 text-black rounded-lg font-semibold transition-colors duration-200"
              >
                Try Again
              </Link>
              
              <Link
                href="/"
                className="w-full inline-flex items-center justify-center px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors duration-200"
              >
                Go Home
              </Link>
            </div>
          </div>
        </div>

        {/* Contact Support */}
        <div className="text-center text-sm text-gray-400">
          <p>
            Need help? Contact our{' '}
            <Link href="/contact" className="text-yellow-500 hover:text-yellow-400">
              support team
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}