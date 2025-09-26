'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, Play, Star } from 'lucide-react'
import Link from 'next/link'

export function HeroSection() {
  const [currentSlide, setCurrentSlide] = useState(0)
  
  const heroSlides = [
    {
      title: "Atlanta's Ultimate",
      subtitle: "Rooftop Playground",
      description: "From rooftop dining to immersive experiences, skyline views to private events, your adventure starts here.",
      image: "/api/placeholder/1920/1080",
      cta: "Get Tickets"
    },
    {
      title: "Unforgettable",
      subtitle: "Event Experiences",
      description: "Host corporate functions, private celebrations, and milestone moments with breathtaking city views.",
      image: "/api/placeholder/1920/1080",
      cta: "Book Event"
    },
    {
      title: "Sky-High",
      subtitle: "Dining Experience",
      description: "Exceptional cuisine paired with warm hospitality and unobstructed Atlanta skyline views.",
      image: "/api/placeholder/1920/1080",
      cta: "Reserve Table"
    }
  ]

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [heroSlides.length])

  return (
    <section className="relative h-screen overflow-hidden">
      {/* Background Images */}
      {heroSlides.map((slide, index) => (
        <div
          key={index}
          className={`absolute inset-0 bg-gradient-to-b from-black/40 to-black/60 transition-opacity duration-1000 ${
            index === currentSlide ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.6)), url(https://images.unsplash.com/photo-1566073771259-6a8506099945?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1920&q=80)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      ))}

      {/* Content */}
      <div className="relative z-10 h-full flex items-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="max-w-4xl mx-auto">
            {/* Hero Text */}
            <div className="mb-8">
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold mb-4">
                <span className="block text-white">
                  {heroSlides[currentSlide].title}
                </span>
                <span className="block text-yellow-500">
                  {heroSlides[currentSlide].subtitle}
                </span>
              </h1>
              <p className="text-xl md:text-2xl text-gray-300 max-w-2xl mx-auto">
                {heroSlides[currentSlide].description}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              <Link
                href="/tickets"
                className="bg-yellow-500 hover:bg-yellow-600 text-black px-8 py-4 rounded-lg text-lg font-semibold transition-colors duration-200 flex items-center gap-2"
              >
                {heroSlides[currentSlide].cta}
              </Link>
              <button className="flex items-center gap-2 text-white hover:text-yellow-500 transition-colors duration-200">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <Play className="h-5 w-5 ml-1" />
                </div>
                <span>Watch Experience</span>
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-12">
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-500">500K+</div>
                <div className="text-gray-300">Happy Guests</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-500">15+</div>
                <div className="text-gray-300">Event Spaces</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-3xl font-bold text-yellow-500">
                  4.9 <Star className="h-6 w-6 fill-current" />
                </div>
                <div className="text-gray-300">Customer Rating</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Slide Indicators */}
      <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 z-20">
        <div className="flex space-x-2">
          {heroSlides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-3 h-3 rounded-full transition-colors duration-200 ${
                index === currentSlide ? 'bg-yellow-500' : 'bg-white/30'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20 animate-bounce">
        <ChevronDown className="h-6 w-6 text-white" />
      </div>
    </section>
  )
}