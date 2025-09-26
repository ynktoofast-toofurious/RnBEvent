import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AdminDashboard } from '@/components/admin/AdminDashboard'

export default async function AdminPage() {
  const session = await auth()
  
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=/admin')
  }
  
  if (session.user.role !== 'admin') {
    redirect('/')
  }
  
  return <AdminDashboard />
}