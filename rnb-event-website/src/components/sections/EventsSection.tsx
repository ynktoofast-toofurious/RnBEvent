'use client'

import { useState, useEffect } from 'react'
import { Calendar, Clock, MapPin, Users, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export function EventsSection() {
  const [selectedCategory, setSelectedCategory] = useState('all')

  const categories = [
    { id: 'all', name: 'All Events' },
    { id: 'music', name: 'Live Music' },
    { id: 'dining', name: 'Special Dining' },
    { id: 'corporate', name: 'Corporate' },
    { id: 'celebration', name: 'Celebrations' }
  ]

  const events = [
    {
      id: 1,
      title: 'Skyline Jazz Night',
      category: 'music',
      date: '2024-10-15',
      time: '8:00 PM',
      location: 'Rooftop Terrace',
      capacity: 150,
      price: 45,
      image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=800&q=80',
      description: 'An intimate evening of smooth jazz under the stars with city views.',
      featured: true
    },
    {
      id: 2,
      title: 'Wine & Dine Experience',
      category: 'dining',
      date: '2024-10-20',
      time: '7:00 PM',
      location: 'Main Dining',
      capacity: 80,
      price: 125,
      image: 'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=800&q=80',
      description: 'A curated wine tasting paired with our chef\'s seasonal menu.',
      featured: false
    },
    {
      id: 3,
      title: 'Corporate Networking Mixer',
      category: 'corporate',
      date: '2024-10-25',
      time: '6:00 PM',
      location: 'Event Space A',
      capacity: 200,
      price: 35,
      image: 'https://images.unsplash.com/photo-1515187029135-18ee286d815b?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=800&q=80',
      description: 'Professional networking with panoramic city views and premium refreshments.',
      featured: false
    },
    {
      id: 4,
      title: 'Halloween Rooftop Party',
      category: 'celebration',
      date: '2024-10-31',
      time: '9:00 PM',
      location: 'Full Rooftop',
      capacity: 300,
      price: 65,
      image: 'https://images.unsplash.com/photo-1509557965043-64ac5b57cdad?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=800&q=80',
      description: 'Spooktacular costume party with DJ, dancing, and themed cocktails.',
      featured: true
    },
    {
      id: 5,
      title: 'Sunday Brunch Series',
      category: 'dining',
      date: '2024-11-03',
      time: '11:00 AM',
      location: 'Garden Terrace',
      capacity: 120,
      price: 55,
      image: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=800&q=80',
      description: 'Atlanta\'s "Best Brunch" featuring bottomless mimosas and skyline views.',
      featured: false
    },
    {
      id: 6,
      title: 'New Year\'s Eve Celebration',
      category: 'celebration',
      date: '2024-12-31',
      time: '10:00 PM',
      location: 'Full Venue',
      capacity: 500,
      price: 150,
      image: 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=800&q=80',
      description: 'Ring in the New Year with the best view in Atlanta and premium open bar.',
      featured: true
    }
  ]

  const filteredEvents = selectedCategory === 'all' 
    ? events 
    : events.filter(event => event.category === selectedCategory)

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <section className="py-20 bg-black" id="events">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Upcoming <span className="text-yellow-500">Events</span>
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Experience unforgettable moments at Atlanta's premier rooftop destination. 
            From intimate dinners to grand celebrations, every event is extraordinary.
          </p>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap justify-center gap-4 mb-12">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-6 py-3 rounded-full font-medium transition-colors duration-200 ${
                selectedCategory === category.id
                  ? 'bg-yellow-500 text-black'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700'
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>

        {/* Events Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredEvents.map((event, index) => (
            <div
              key={event.id}
              className={`bg-gray-900 rounded-2xl overflow-hidden hover:transform hover:scale-105 transition-all duration-300 ${
                event.featured ? 'ring-2 ring-yellow-500' : ''
              }`}
            >
              {/* Event Image */}
              <div className="relative">
                <img
                  src={event.image}
                  alt={event.title}
                  className="w-full h-48 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                
                {/* Featured Badge */}
                {event.featured && (
                  <div className="absolute top-4 left-4">
                    <span className="bg-yellow-500 text-black px-3 py-1 rounded-full text-sm font-medium">
                      Featured
                    </span>
                  </div>
                )}

                {/* Price Tag */}
                <div className="absolute top-4 right-4">
                  <div className="bg-black/80 text-white px-3 py-1 rounded-lg text-sm font-medium">
                    ${event.price}
                  </div>
                </div>
              </div>

              {/* Event Content */}
              <div className="p-6">
                <h3 className="text-xl font-bold text-white mb-2">
                  {event.title}
                </h3>
                <p className="text-gray-300 text-sm mb-4 line-clamp-2">
                  {event.description}
                </p>

                {/* Event Details */}
                <div className="space-y-2 mb-6">
                  <div className="flex items-center text-gray-400 text-sm">
                    <Calendar className="h-4 w-4 mr-2" />
                    <span>{formatDate(event.date)}</span>
                  </div>
                  <div className="flex items-center text-gray-400 text-sm">
                    <Clock className="h-4 w-4 mr-2" />
                    <span>{event.time}</span>
                  </div>
                  <div className="flex items-center text-gray-400 text-sm">
                    <MapPin className="h-4 w-4 mr-2" />
                    <span>{event.location}</span>
                  </div>
                  <div className="flex items-center text-gray-400 text-sm">
                    <Users className="h-4 w-4 mr-2" />
                    <span>{event.capacity} guests max</span>
                  </div>
                </div>

                {/* Book Button */}
                <Link
                  href={`/events/${event.id}`}
                  className="block w-full bg-yellow-500 hover:bg-yellow-600 text-black text-center py-3 rounded-lg font-semibold transition-colors duration-200"
                >
                  Book Now
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* View All Events Button */}
        <div className="text-center mt-12">
          <Link
            href="/events"
            className="inline-flex items-center space-x-2 bg-transparent border-2 border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-black px-8 py-4 rounded-lg text-lg font-semibold transition-colors duration-200"
          >
            <span>View All Events</span>
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </section>
  )
}