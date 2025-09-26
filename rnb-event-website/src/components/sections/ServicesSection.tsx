'use client'

import { useState } from 'react'
import { ArrowRight, Star, Clock, Users, MapPin } from 'lucide-react'
import Link from 'next/link'

export function ServicesSection() {
  const [activeService, setActiveService] = useState(0)

  const services = [
    {
      id: 'dining',
      title: 'Rooftop Dining',
      subtitle: 'Sky-High Culinary Experience',
      description: 'Exceptional cuisine paired with warm hospitality and unobstructed Atlanta skyline views. Our award-winning chef team creates classically-prepared dishes with modern flair.',
      image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1920&q=80',
      features: ['Award-Winning Chef', 'Panoramic Views', 'Premium Ingredients', 'Craft Cocktails'],
      price: 'From $45/person'
    },
    {
      id: 'events',
      title: 'Private Events',
      subtitle: 'Unforgettable Celebrations',
      description: 'Host corporate functions, wedding celebrations, and milestone parties with breathtaking city views. Our dedicated event professionals bring your vision to life.',
      image: 'https://images.unsplash.com/photo-1511578314322-379afb476865?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1920&q=80',
      features: ['Event Planning', 'Custom Catering', 'Audio/Visual Setup', 'Dedicated Staff'],
      price: 'Custom Pricing'
    },
    {
      id: 'entertainment',
      title: 'Entertainment',
      subtitle: 'Immersive Experiences',
      description: 'From live music to interactive experiences, we offer entertainment that creates lasting memories. Take home the grand prize or slow down with fine dining.',
      image: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1920&q=80',
      features: ['Live Music', 'Interactive Games', 'Special Events', 'Themed Nights'],
      price: 'Included with Entry'
    },
    {
      id: 'membership',
      title: 'VIP Membership',
      subtitle: 'Exclusive Access & Perks',
      description: 'Visit anytime with priority access, exclusive discounts, and member-only events. Score perks and access exclusive experiences all year long.',
      image: 'https://images.unsplash.com/photo-1549924231-f129b911e442?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1920&q=80',
      features: ['Priority Access', 'Exclusive Events', 'Member Discounts', 'Guest Passes'],
      price: 'From $199/year'
    }
  ]

  return (
    <section className="py-20 bg-gray-900" id="services">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Our <span className="text-yellow-500">Offerings</span>
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            From comfortable and casual to sophisticated and upscale, 
            experience the ultimate rooftop destination with unbelievable views.
          </p>
        </div>

        {/* Service Navigation */}
        <div className="flex flex-wrap justify-center gap-4 mb-12">
          {services.map((service, index) => (
            <button
              key={service.id}
              onClick={() => setActiveService(index)}
              className={`px-6 py-3 rounded-lg font-medium transition-colors duration-200 ${
                activeService === index
                  ? 'bg-yellow-500 text-black'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {service.title}
            </button>
          ))}
        </div>

        {/* Active Service Display */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div className="space-y-6">
            <div>
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-2">
                {services[activeService].title}
              </h3>
              <h4 className="text-xl text-yellow-500 mb-4">
                {services[activeService].subtitle}
              </h4>
              <p className="text-gray-300 text-lg leading-relaxed">
                {services[activeService].description}
              </p>
            </div>

            {/* Features */}
            <div className="grid grid-cols-2 gap-4">
              {services[activeService].features.map((feature, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <Star className="h-4 w-4 text-yellow-500 fill-current" />
                  <span className="text-gray-300">{feature}</span>
                </div>
              ))}
            </div>

            {/* Pricing and CTA */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pt-6 border-t border-gray-800">
              <div className="mb-4 sm:mb-0">
                <span className="text-2xl font-bold text-yellow-500">
                  {services[activeService].price}
                </span>
              </div>
              <Link
                href={`/services#${services[activeService].id}`}
                className="inline-flex items-center space-x-2 bg-transparent border-2 border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-black px-6 py-3 rounded-lg transition-colors duration-200"
              >
                <span>Learn More</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Image */}
          <div className="relative">
            <div className="aspect-w-16 aspect-h-9 rounded-2xl overflow-hidden">
              <img
                src={services[activeService].image}
                alt={services[activeService].title}
                className="w-full h-[400px] object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            </div>
            
            {/* Floating Stats */}
            <div className="absolute bottom-6 left-6 right-6">
              <div className="bg-black/80 backdrop-blur-md rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <Clock className="h-5 w-5 text-yellow-500 mx-auto mb-1" />
                    <div className="text-sm text-gray-300">Open Daily</div>
                  </div>
                  <div>
                    <Users className="h-5 w-5 text-yellow-500 mx-auto mb-1" />
                    <div className="text-sm text-gray-300">All Ages</div>
                  </div>
                  <div>
                    <MapPin className="h-5 w-5 text-yellow-500 mx-auto mb-1" />
                    <div className="text-sm text-gray-300">Rooftop</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}