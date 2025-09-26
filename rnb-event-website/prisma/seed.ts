import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Create sample navigation items
  await prisma.navigation.createMany({
    data: [
      { label: 'Home', href: '/', order: 1 },
      { label: 'Services', href: '/services', order: 2 },
      { label: 'Events', href: '/events', order: 3 },
      { label: 'Gallery', href: '/gallery', order: 4 },
      { label: 'Contact', href: '/contact', order: 5 },
    ]
  })

  // Create sample page content
  const homePage = await prisma.page.create({
    data: {
      slug: 'home',
      title: 'Home Page',
      description: 'The main homepage of RnBEvent',
      content: {
        hero: {
          title: "Atlanta's Ultimate Rooftop Playground",
          subtitle: "From rooftop dining to immersive experiences",
          description: "Your adventure starts here with breathtaking city views."
        }
      },
      published: true
    }
  })

  // Create sample services
  await prisma.service.createMany({
    data: [
      {
        title: 'Rooftop Dining',
        description: 'Exceptional cuisine with panoramic city views',
        content: { features: ['Award-Winning Chef', 'Panoramic Views', 'Premium Ingredients'] },
        price: 45.00,
        category: 'dining',
        featured: true,
        order: 1
      },
      {
        title: 'Private Events',
        description: 'Unforgettable celebrations with professional planning',
        content: { features: ['Event Planning', 'Custom Catering', 'Dedicated Staff'] },
        category: 'events',
        featured: true,
        order: 2
      },
      {
        title: 'Entertainment',
        description: 'Live music and interactive experiences',
        content: { features: ['Live Music', 'Interactive Games', 'Special Events'] },
        category: 'entertainment',
        order: 3
      }
    ]
  })

  // Create sample events
  await prisma.event.createMany({
    data: [
      {
        title: 'Skyline Jazz Night',
        description: 'An intimate evening of smooth jazz under the stars',
        content: { capacity: 150, location: 'Rooftop Terrace' },
        startDate: new Date('2024-10-15T20:00:00'),
        endDate: new Date('2024-10-15T23:00:00'),
        location: 'Rooftop Terrace',
        price: 45.00,
        capacity: 150,
        published: true
      },
      {
        title: 'Wine & Dine Experience',
        description: 'Curated wine tasting with seasonal menu',
        content: { capacity: 80, location: 'Main Dining' },
        startDate: new Date('2024-10-20T19:00:00'),
        endDate: new Date('2024-10-20T22:00:00'),
        location: 'Main Dining',
        price: 125.00,
        capacity: 80,
        published: true
      }
    ]
  })

  console.log('Database seeded successfully!')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })