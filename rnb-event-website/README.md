# RnBEvent - Ultimate Event Venue Website

A modern, full-stack website for event venues featuring both user-facing pages and an admin content management system. Built with Next.js, TypeScript, Tailwind CSS, and NextAuth.js with Google SSO integration.

## ✨ Features

### User-Facing Website
- **Modern Rooftop Venue Design** - Inspired by poncecityroof.com with stunning visuals
- **Responsive Design** - Mobile-first design that works on all devices
- **Interactive Sections**:
  - Hero carousel with multiple slides
  - Services showcase with dynamic content
  - Event listings with filtering
  - Image gallery with lightbox
  - Customer testimonials carousel
  - Contact form with validation

### Admin Dashboard
- **Google SSO Authentication** - Secure login with Google accounts
- **Role-Based Access Control** - Admin-only areas protected by middleware
- **Content Management** - Edit website content, manage pages
- **Event Management** - Create and manage events (expandable)
- **User Management** - View and manage user accounts
- **Analytics Dashboard** - Website performance metrics
- **Media Manager** - Upload and organize images/files
- **Contact Management** - View form submissions

### Technical Features
- **Next.js 14** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **NextAuth.js** for authentication
- **Prisma ORM** with PostgreSQL database
- **Role-based middleware** for route protection
- **Responsive design** with mobile-first approach

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- PostgreSQL database (local or cloud)
- Google Cloud Console project for OAuth

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create a `.env.local` file with the following variables:

```env
# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here-please-change-this-in-production

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Database Configuration
DATABASE_URL="postgresql://user:password@localhost:5432/rnbeventdb"

# Admin Email (Users with this email will have admin access)
ADMIN_EMAIL=admin@example.com
```

### 3. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Go to Credentials → Create Credentials → OAuth 2.0 Client IDs
5. Configure OAuth consent screen
6. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://yourdomain.com/api/auth/callback/google` (production)
7. Copy Client ID and Client Secret to your `.env.local`

### 4. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init
```

### 5. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` to see your website!

## 📱 Usage

### User Experience
1. Visit the homepage to explore services and events
2. Browse the gallery and read testimonials
3. Contact form for event inquiries
4. Sign in with Google for personalized experience

### Admin Access
1. Sign in with Google using the admin email configured in `.env.local`
2. Navigate to `/admin` to access the dashboard
3. Manage content, events, users, and view analytics

## 🎨 Customization

### Styling
- Modify `src/app/globals.css` for global styles
- Update Tailwind config in `tailwind.config.ts`
- Component-specific styling in individual files

### Content
- Update hero slides in `HeroSection.tsx`
- Modify services in `ServicesSection.tsx`
- Add events in `EventsSection.tsx`
- Customize testimonials in `TestimonialsSection.tsx`

## 📦 Deployment

### Vercel (Recommended)
1. Push code to GitHub repository
2. Connect repository to Vercel
3. Configure environment variables in Vercel dashboard
4. Deploy automatically on push to main branch

## 🔐 Security Features

- Route Protection: Middleware protects admin routes
- Role-Based Access: Admin role required for dashboard access
- Secure Authentication: Google OAuth integration
- Environment Variables: Sensitive data stored securely
