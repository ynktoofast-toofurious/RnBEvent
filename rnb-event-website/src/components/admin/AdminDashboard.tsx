'use client'

import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { 
  LayoutDashboard, 
  FileText, 
  Calendar, 
  Users, 
  ImageIcon, 
  Settings, 
  LogOut,
  BarChart3,
  Mail,
  Menu,
  X
} from 'lucide-react'
import { DashboardOverview } from './DashboardOverview'
import { ContentManager } from './ContentManager'
import { 
  EventManager, 
  UserManager, 
  MediaManager, 
  AnalyticsView, 
  ContactManager, 
  AdminSettings 
} from './AdminComponents'

type AdminView = 
  | 'overview' 
  | 'content' 
  | 'events' 
  | 'users' 
  | 'media' 
  | 'analytics' 
  | 'contacts' 
  | 'settings'

export function AdminDashboard() {
  const [currentView, setCurrentView] = useState<AdminView>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { data: session } = useSession()

  const navigationItems = [
    { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
    { id: 'content', icon: FileText, label: 'Content' },
    { id: 'events', icon: Calendar, label: 'Events' },
    { id: 'users', icon: Users, label: 'Users' },
    { id: 'media', icon: ImageIcon, label: 'Media' },
    { id: 'analytics', icon: BarChart3, label: 'Analytics' },
    { id: 'contacts', icon: Mail, label: 'Contacts' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ]

  const renderContent = () => {
    switch (currentView) {
      case 'overview':
        return <DashboardOverview />
      case 'content':
        return <ContentManager />
      case 'events':
        return <EventManager />
      case 'users':
        return <UserManager />
      case 'media':
        return <MediaManager />
      case 'analytics':
        return <AnalyticsView />
      case 'contacts':
        return <ContactManager />
      case 'settings':
        return <AdminSettings />
      default:
        return <DashboardOverview />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:static lg:inset-0`}>
        <div className="flex items-center justify-between h-16 px-6 bg-black">
          <div className="text-xl font-bold text-white">
            RnB<span className="text-yellow-500">Admin</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <nav className="mt-8">
          <div className="px-4 space-y-2">
            {navigationItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentView(item.id as AdminView)
                    setSidebarOpen(false)
                  }}
                  className={`w-full flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-200 ${
                    currentView === item.id
                      ? 'bg-yellow-500 text-black'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.label}
                </button>
              )
            })}
          </div>

          {/* User Info & Logout */}
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800">
            <div className="flex items-center mb-3">
              <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                <span className="text-black font-semibold text-sm">
                  {session?.user?.name?.charAt(0)}
                </span>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-white truncate">
                  {session?.user?.name}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {session?.user?.email}
                </p>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="w-full flex items-center px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg transition-colors duration-200"
            >
              <LogOut className="mr-3 h-5 w-5" />
              Sign Out
            </button>
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className="lg:ml-64">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 h-16 flex items-center justify-between px-4 lg:px-8">
          <div className="flex items-center">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden mr-4 text-gray-500 hover:text-gray-700"
            >
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 capitalize">
              {currentView}
            </h1>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden sm:block text-sm text-gray-500">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="p-4 lg:p-8">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}