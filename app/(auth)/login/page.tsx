import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-2">LeadFinder</h1>
        <p className="text-gray-400 mb-8">Find freelance leads on autopilot</p>
        <form action="/auth/google" method="POST">
          <button
            type="submit"
            className="w-full bg-white text-gray-900 font-medium py-3 rounded-lg hover:bg-gray-100 transition"
          >
            Continue with Google
          </button>
        </form>
      </div>
    </div>
  )
}
