'use client'

import { Users, Calendar, FileText, TrendingUp, Mail, Star } from 'lucide-react'

export function DashboardOverview() {
  const stats = [
    {
      title: 'Total Users',
      value: '1,234',
      change: '+12%',
      changeType: 'positive' as const,
      icon: Users
    },
    {
      title: 'Active Events',
      value: '23',
      change: '+5%',
      changeType: 'positive' as const,
      icon: Calendar
    },
    {
      title: 'Content Pages',
      value: '45',
      change: '+2%',
      changeType: 'positive' as const,
      icon: FileText
    },
    {
      title: 'Monthly Revenue',
      value: '$12,450',
      change: '+18%',
      changeType: 'positive' as const,
      icon: TrendingUp
    }
  ]

  const recentActivity = [
    {
      id: 1,
      action: 'New event booking',
      user: 'Sarah Johnson',
      time: '2 hours ago',
      type: 'booking'
    },
    {
      id: 2,
      action: 'Content page updated',
      user: 'Admin User',
      time: '4 hours ago',
      type: 'content'
    },
    {
      id: 3,
      action: 'New user registration',
      user: 'Michael Chen',
      time: '6 hours ago',
      type: 'user'
    },
    {
      id: 4,
      action: 'Contact form submission',
      user: 'Emily Rodriguez',
      time: '8 hours ago',
      type: 'contact'
    },
    {
      id: 5,
      action: 'Event cancelled',
      user: 'David Thompson',
      time: '1 day ago',
      type: 'booking'
    }
  ]

  const upcomingEvents = [
    {
      id: 1,
      title: 'Skyline Jazz Night',
      date: '2024-10-15',
      time: '8:00 PM',
      attendees: 85,
      capacity: 150
    },
    {
      id: 2,
      title: 'Wine & Dine Experience',
      date: '2024-10-20',
      time: '7:00 PM',
      attendees: 62,
      capacity: 80
    },
    {
      id: 3,
      title: 'Corporate Networking',
      date: '2024-10-25',
      time: '6:00 PM',
      attendees: 145,
      capacity: 200
    }
  ]

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.title} className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <Icon className="h-6 w-6 text-yellow-600" />
                </div>
              </div>
              <div className="mt-4 flex items-center">
                <span className={`text-sm font-medium ${
                  stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {stat.change}
                </span>
                <span className="text-sm text-gray-500 ml-2">vs last month</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${
                    activity.type === 'booking' ? 'bg-green-500' :
                    activity.type === 'content' ? 'bg-blue-500' :
                    activity.type === 'user' ? 'bg-purple-500' : 'bg-orange-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {activity.action}
                    </p>
                    <p className="text-sm text-gray-500">
                      by {activity.user} • {activity.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Upcoming Events */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Upcoming Events</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {upcomingEvents.map((event) => (
                <div key={event.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900">{event.title}</h4>
                    <span className="text-sm text-gray-500">
                      {new Date(event.date).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{event.time}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                      {event.attendees}/{event.capacity} attendees
                    </span>
                    <div className="w-24 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-yellow-500 h-2 rounded-full" 
                        style={{width: `${(event.attendees / event.capacity) * 100}%`}}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button className="flex flex-col items-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-yellow-500 hover:bg-yellow-50 transition-colors duration-200">
            <Calendar className="h-8 w-8 text-gray-400 mb-2" />
            <span className="text-sm font-medium text-gray-700">Add Event</span>
          </button>
          <button className="flex flex-col items-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-yellow-500 hover:bg-yellow-50 transition-colors duration-200">
            <FileText className="h-8 w-8 text-gray-400 mb-2" />
            <span className="text-sm font-medium text-gray-700">Edit Content</span>
          </button>
          <button className="flex flex-col items-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-yellow-500 hover:bg-yellow-50 transition-colors duration-200">
            <Mail className="h-8 w-8 text-gray-400 mb-2" />
            <span className="text-sm font-medium text-gray-700">View Messages</span>
          </button>
          <button className="flex flex-col items-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-yellow-500 hover:bg-yellow-50 transition-colors duration-200">
            <Users className="h-8 w-8 text-gray-400 mb-2" />
            <span className="text-sm font-medium text-gray-700">Manage Users</span>
          </button>
        </div>
      </div>
    </div>
  )
}