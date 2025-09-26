'use client'

import { useState } from 'react'
import { Star, Quote, ChevronLeft, ChevronRight } from 'lucide-react'

export function TestimonialsSection() {
  const [currentTestimonial, setCurrentTestimonial] = useState(0)

  const testimonials = [
    {
      id: 1,
      name: 'Sarah Johnson',
      role: 'Event Coordinator',
      company: 'Tech Innovations Inc.',
      rating: 5,
      review: 'RnBEvent exceeded all our expectations for our annual company party. The rooftop views were absolutely breathtaking, and the staff went above and beyond to make sure every detail was perfect. Our employees are still talking about it!',
      image: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=400&q=80',
      event: 'Corporate Annual Party'
    },
    {
      id: 2,
      name: 'Michael Chen',
      role: 'Groom',
      company: 'Wedding Celebration',
      rating: 5,
      review: 'Our wedding reception at RnBEvent was absolutely magical. The sunset over Atlanta created the perfect backdrop for our special day. The food was exceptional, and the service was flawless. It truly was the best day of our lives.',
      image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=400&q=80',
      event: 'Wedding Reception'
    },
    {
      id: 3,
      name: 'Emily Rodriguez',
      role: 'Marketing Director',
      company: 'Creative Agency',
      rating: 5,
      review: 'The atmosphere at RnBEvent is unmatched. We hosted our client appreciation dinner here, and it was sophisticated yet relaxed. The Atlanta skyline views added such elegance to our event. Highly recommend!',
      image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=400&q=80',
      event: 'Client Appreciation Dinner'
    },
    {
      id: 4,
      name: 'David Thompson',
      role: 'Birthday Celebrant',
      company: 'Personal Celebration',
      rating: 5,
      review: 'I celebrated my 40th birthday at RnBEvent and it was incredible. The team helped plan every detail, from the custom menu to the entertainment. My guests had an amazing time, and the views made for perfect photos!',
      image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=400&q=80',
      event: 'Birthday Celebration'
    },
    {
      id: 5,
      name: 'Lisa Park',
      role: 'HR Manager',
      company: 'Financial Services',
      rating: 5,
      review: 'We chose RnBEvent for our team building event, and it was the perfect choice. The variety of activities and the stunning rooftop setting really brought our team together. The food and drinks were outstanding too!',
      image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=400&q=80',
      event: 'Team Building Event'
    }
  ]

  const nextTestimonial = () => {
    setCurrentTestimonial((prev) => (prev + 1) % testimonials.length)
  }

  const prevTestimonial = () => {
    setCurrentTestimonial((prev) => 
      prev === 0 ? testimonials.length - 1 : prev - 1
    )
  }

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, index) => (
      <Star
        key={index}
        className={`h-5 w-5 ${
          index < rating ? 'text-yellow-500 fill-current' : 'text-gray-400'
        }`}
      />
    ))
  }

  return (
    <section className="py-20 bg-black" id="testimonials">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            What Our <span className="text-yellow-500">Guests Say</span>
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            "A Lively and Warm Indoor and Outdoor Space for Guests to Enjoy Culinary Offerings and Spirits, 
            Complemented by An Unprecedented Panoramic View of The Atlanta Skyline."
          </p>
          <div className="mt-4 text-gray-400 italic">
            — The Atlanta Journal Constitution
          </div>
        </div>

        {/* Main Testimonial Display */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-gray-900 rounded-2xl p-8 md:p-12 relative">
            {/* Quote Icon */}
            <div className="absolute top-6 left-6 text-yellow-500 opacity-20">
              <Quote className="h-12 w-12" />
            </div>

            {/* Navigation Buttons */}
            <button
              onClick={prevTestimonial}
              className="absolute left-4 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-yellow-500 hover:bg-yellow-600 rounded-full flex items-center justify-center text-black transition-colors duration-200"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <button
              onClick={nextTestimonial}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-yellow-500 hover:bg-yellow-600 rounded-full flex items-center justify-center text-black transition-colors duration-200"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            {/* Testimonial Content */}
            <div className="text-center">
              {/* Rating */}
              <div className="flex justify-center mb-6">
                {renderStars(testimonials[currentTestimonial].rating)}
              </div>

              {/* Review Text */}
              <blockquote className="text-xl md:text-2xl text-gray-100 mb-8 leading-relaxed">
                "{testimonials[currentTestimonial].review}"
              </blockquote>

              {/* Author Info */}
              <div className="flex items-center justify-center space-x-4">
                <img
                  src={testimonials[currentTestimonial].image}
                  alt={testimonials[currentTestimonial].name}
                  className="w-16 h-16 rounded-full object-cover"
                />
                <div className="text-left">
                  <div className="font-semibold text-white text-lg">
                    {testimonials[currentTestimonial].name}
                  </div>
                  <div className="text-gray-400">
                    {testimonials[currentTestimonial].role}
                  </div>
                  <div className="text-gray-500 text-sm">
                    {testimonials[currentTestimonial].company}
                  </div>
                  <div className="text-yellow-500 text-sm mt-1">
                    {testimonials[currentTestimonial].event}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Testimonial Dots */}
        <div className="flex justify-center mt-8 space-x-2">
          {testimonials.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentTestimonial(index)}
              className={`w-3 h-3 rounded-full transition-colors duration-200 ${
                index === currentTestimonial ? 'bg-yellow-500' : 'bg-gray-600'
              }`}
            />
          ))}
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mt-16">
          <div className="text-center">
            <div className="text-4xl font-bold text-yellow-500 mb-2">4.9/5</div>
            <div className="text-gray-300">Average Rating</div>
            <div className="flex justify-center mt-2">
              {renderStars(5)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-yellow-500 mb-2">500+</div>
            <div className="text-gray-300">Happy Events</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-yellow-500 mb-2">50K+</div>
            <div className="text-gray-300">Satisfied Guests</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-yellow-500 mb-2">98%</div>
            <div className="text-gray-300">Would Recommend</div>
          </div>
        </div>

        {/* Awards and Recognition */}
        <div className="text-center mt-16">
          <h3 className="text-2xl font-bold mb-6">Awards & Recognition</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="bg-gray-800 p-6 rounded-lg">
              <div className="text-yellow-500 text-2xl font-bold mb-2">Best Brunch</div>
              <div className="text-gray-300">Atlanta Magazine 2024</div>
            </div>
            <div className="bg-gray-800 p-6 rounded-lg">
              <div className="text-yellow-500 text-2xl font-bold mb-2">Top Event Venue</div>
              <div className="text-gray-300">Atlanta Business Chronicle</div>
            </div>
            <div className="bg-gray-800 p-6 rounded-lg">
              <div className="text-yellow-500 text-2xl font-bold mb-2">Excellence Award</div>
              <div className="text-gray-300">TripAdvisor 2024</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}